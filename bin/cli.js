#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import chalk from 'chalk';
import { Service, kill, list, elevate, EventLogger } from '../index.js';
import { copyFile } from '../copy-files.js';

const [, , sub, ...args] = process.argv,
  /**
   * 解析 --键 值,值先按 JSON 解析,失败按字符串;
   * @param {string[]} argv 参数数组
   * @returns {{flags: Object, rest: string[]}} 选项与位置参数
   */
  parseFlags = argv => {
    const flags = {}, rest = [];
    for (let i = 0; i < argv.length; i++) {
      const cur = argv[i];
      if (!cur.startsWith('--')) { rest.push(cur); continue }
      const key = cur.slice(2), next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[key] = true; continue }
      try { flags[key] = JSON.parse(next) } catch { flags[key] = next }
      i++;
    }
    return { flags, rest };
  },

  /**
   * 读取当前目录的 win-service.config.js,不存在返回空对象;
   * @returns {Promise<Object>} 配置对象
   */
  loadConfig = async () => {
    const cfg = path.resolve(process.env.INIT_CWD || process.cwd(), 'win-service.config.js');
    if (!fs.existsSync(cfg)) return {};
    const mod = await import(pathToFileURL(cfg).href);
    return mod.default ?? {};
  },
  resolveConfig = async flags => ({ ...(await loadConfig()), ...flags }),

  /**
   * 校验配置必填项,缺失即退出;
   * @param {Object} config 配置对象
   */
  requireConfig = config => {
    if (config.name && config.script) return;
    console.error(chalk.red('✗ ') + '缺少配置:请在 win-service.config.js 填写 name 与 script,或用 --name/--script 覆盖');
    process.exit(1);
  },

  /**
   * 解析配置并构造 Service;
   * @param {string[]} argv 参数
   * @returns {Promise<{svc: Service, flags: Object}>} 服务实例与命令行选项
   */
  buildService = async argv => {
    const { flags } = parseFlags(argv), config = await resolveConfig(flags);
    requireConfig(config);
    return { svc: new Service({ ...config, quiet: true }), flags };
  },

  /**
   * 等待服务事件,超时后按 exists 判定;
   * @param {Service} svc 服务实例
   * @param {string[]} okEvents 成功事件名
   * @param {string[]} [errEvents] 失败事件名
   * @returns {Promise<string>} 触发的事件名
   */
  waitEvent = (svc, okEvents, errEvents = ['error']) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const code = svc.exists;
      if (code === 3) resolve('timeout-ok');
      else reject(new Error(`操作超时,服务状态码:${code}`));
    }, 30000);
    okEvents.forEach(e => svc.once(e, () => { clearTimeout(timer); resolve(e) }));
    errEvents.forEach(e => svc.once(e, err => { clearTimeout(timer); reject(err) }));
  }),

  /**
   * 判定安装后是否启动,命令行 --start/--no-start 优先,其次配置 autoStart,缺省启动;
   * @param {Object} config 配置对象,判定后移除相关字段
   * @returns {boolean} 是否启动
   */
  resolveAutoStart = config => {
    const take = key => { const v = config[key]; delete config[key]; return v },
      startFlag = take('start'), noStartFlag = take('no-start'), cfgStart = take('autoStart');
    if (startFlag !== undefined) return startFlag !== false;
    if (noStartFlag !== undefined) return false;
    if (typeof cfgStart === 'boolean') return cfgStart;
    return true;
  },

  /**
   * 按配置执行服务方法;
   * @param {string} method 方法名
   * @param {string[]} argv 参数
   * @returns {Promise<void>}
   */
  runService = async (method, argv) => {
    const { flags } = parseFlags(argv), config = await resolveConfig(flags);
    requireConfig(config);
    const svc = new Service({ ...config, quiet: true }),
      autoStart = method === 'install' && svc.exists !== 3 ? resolveAutoStart(config) : true,
      okMap = {
        install: ['install', 'alreadyinstalled'], uninstall: ['uninstall', 'alreadyuninstalled'],
        start: ['start'], stop: ['stop', 'alreadystopped'], restart: ['start']
      }, pending = waitEvent(svc, okMap[method]);
    let started = false;
    if (method === 'install' && autoStart) svc.once('start', () => { started = true });

    if (method === 'install') await svc.install(undefined, autoStart);
    else await svc[method]();
    const evt = await pending, labelMap = { install: '安装', uninstall: '卸载', start: '启动', stop: '停止' },
      label = method === 'restart' ? '重启' : labelMap[method];
    if (evt.startsWith('already'))
      return console.log(chalk.yellow('✓ 已跳过: ') + chalk.gray(`服务${evt.includes('install') ? '已安装' : '已卸载'}`));
    console.log(chalk.green('✓ ') + chalk.greenBright(`${label}完成`));
    if (started) console.log(chalk.green('✓ ') + chalk.greenBright('服务已启动'));
  },

  /**
   * 输出用法;
   */
  printHelp = () => {
    const cmd = (name, desc) => `      ${chalk.cyanBright(name.padEnd(26))}${chalk.gray(desc)}`;
    console.log([
      `  ${chalk.blueBright('用法:')} windows <命令> [--键 值]`, '',
      `    ${chalk.cyan('服务类')} ${chalk.gray('(默认读当前目录 win-service.config.js,--键 值 覆盖)')}`,
      cmd('install', '安装服务,装完默认启动;--no-start 关闭自动启动'),
      cmd('uninstall', '卸载服务'),
      cmd('start', '启动服务'),
      cmd('stop', '停止服务'),
      cmd('restart', '重启服务'),
      cmd('status', '查询状态,输出 0 不存在 1 有服务无文件 2 有文件无服务 3 完整'),
      cmd('xml', '输出 winsw 配置 XML'),
      cmd('exe', '生成 winsw 可执行文件;--dir 指定输出目录,默认脚本目录下 daemon'), '',
      `    ${chalk.cyan('其它')}`,
      cmd('example', '生成 win-service.config.js 模板到当前项目'),
      cmd('list', '列出运行中的进程;--verbose 显示详细信息'),
      cmd('kill', '结束进程,参数为进程 PID;例如 kill 1234,--force 强制结束'),
      cmd('log', '写事件日志,参数依次为级别与消息;例如 log info 启动完成'),
      cmd('is-admin', '检查当前是否管理员'),
      cmd('elevate', '以管理员权限执行命令,参数为要执行的命令;例如 elevate "net session"'),
      cmd('help', '显示本帮助')
    ].join('\n'));
  },

  /**
   * 命令分发入口;
   */
  main = async () => {
    if (!sub || sub === 'help' || sub === '-h' || sub === '--help') return printHelp(), process.exit(0);
    if (sub === 'example') return copyFile() ? process.exit(0) : process.exit(1);
    if (sub === 'is-admin') {
      try {
        execSync('net session', { stdio: 'ignore' });
        console.log(chalk.green('✓ ') + chalk.greenBright('管理员')), process.exit(0);
      } catch {
        console.log(chalk.red('✗ ') + chalk.redBright('非管理员')), process.exit(1);
      }
    }
    if (sub === 'elevate') {
      if (!args.length) return console.error(chalk.red('✗ ') + '缺少命令'), process.exit(1);
      return elevate(args.join(' '), (err, stdout) => {
        if (err) return console.error(chalk.red('✗ ') + err.message), process.exit(1);
        if (stdout) console.log(stdout);
        process.exit(0);
      });
    }
    if (sub === 'kill') {
      const { flags, rest } = parseFlags(args);
      if (!rest[0]) return console.error(chalk.red('✗ ') + '缺少 pid'), process.exit(1);
      const onDone = err => err
        ? (console.error(chalk.red('✗ ') + err.message), process.exit(1))
        : (console.log(chalk.green('✓ ') + chalk.greenBright('已结束')), process.exit(0));
      return kill(Number(rest[0]), onDone, Boolean(flags.force));
    }
    if (sub === 'list') {
      const { flags } = parseFlags(args);
      return list(procs => {
        procs.forEach(p => console.log(Object.values(p).join('\t'))), process.exit(0);
      }, Boolean(flags.verbose));
    }
    if (sub === 'log') {
      const { flags, rest } = parseFlags(args), [level, ...msgParts] = rest,
        methodMap = { info: 'info', warn: 'warn', error: 'error', success: 'auditSuccess', failure: 'auditFailure' },
        method = methodMap[level];
      if (!method)
        return console.error(chalk.red('✗ ') + `未知级别: ${level};可用:info|warn|error|success|failure`), process.exit(1);
      if (!msgParts.length) return console.error(chalk.red('✗ ') + '缺少消息'), process.exit(1);
      const logger = new EventLogger(flags.source ? { source: flags.source } : {});
      return logger[method](msgParts.join(' '), flags.id ?? 1000, err => {
        if (err) return console.error(chalk.red('✗ ') + err.message), process.exit(1);
        console.log(chalk.green('✓ ') + chalk.greenBright('已写入')), process.exit(0);
      });
    }
    if (sub === 'xml') {
      const { svc } = await buildService(args);
      return console.log(svc.toXml()), process.exit(0);
    }
    if (sub === 'exe') {
      const { svc, flags } = await buildService(args);
      try { await svc.toExe(flags.dir), console.log(chalk.green('✓ 已生成: ') + svc.root), process.exit(0) }
      catch (e) { console.error(chalk.red('✗ ') + e.message), process.exit(1) }
    }
    if (sub === 'status') {
      const { svc } = await buildService(args), code = svc.exists,
        color = code === 3 ? chalk.green : code === 0 ? chalk.red : chalk.yellow;
      return console.log(chalk.gray('状态码: ') + color(code)), process.exit(0);
    }
    if (['install', 'uninstall', 'start', 'stop', 'restart'].includes(sub)) {
      try { await runService(sub, args), process.exit(0) }
      catch (e) { console.error(chalk.red('✗ ') + e.message), process.exit(1) }
    }
    console.error(chalk.red('✗ 未知命令: ') + chalk.yellow(sub)), console.log(''), printHelp(), process.exit(1);
  };

main();