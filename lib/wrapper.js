/**
 * 进程包装器 (Process Wrapper)
 *
 * 一个用于管理和监控子进程的包装器,提供以下功能:
 * 1. 自动重启失败的进程,支持多种重启策略
 * 2. 进程生命周期监控和日志记录
 * 3. 优雅的进程终止处理
 * 4. 重启次数限制和频率控制
 * 5. 支持通过事件日志或控制台输出日志
 *
 * 命令行参数：
 *   -f, --file: 要运行的脚本绝对路径（必需）
 *   -d, --cwd: 子进程工作目录
 *   -l, --log: 日志描述名称（必需）
 *   -e, --eventlog: 事件日志容器（APPLICATION或SYSTEM）
 *   -m, --maxretries: 最大重启次数（-1表示无限制）
 *   -r, --maxrestarts: 时间窗口内最大重启次数
 *   -w, --wait: 重启等待时间（秒）
 *   -g, --grow: 等待时间增长系数
 *   -a, --abortonerror: 错误时是否终止
 *   -s, --stopparentfirst: 是否允许优雅退出
 *   --scriptoptions: 传递给脚本的选项
 */
import { path, fs, net, fork } from './shared.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { EventLogger } from './eventlog.js';

// 时间窗口（秒）,默认时间窗口内最大重启次数,默认重启等待时间（秒）,默认等待时间增长系数
const timeWindow = 60, defaultMaxRestarts = 3, defaultWaitTime = 1, defaultGrowth = 0.25,
  booleanChoices = ['y', 'n', 'yes', 'no', 'true', 'false'],
  // 布尔选项解析函数
  parseBooleanOption = value => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return 'yes';
    if (normalized === 'false') return 'no';
    return normalized;
  },

  // 带引号参数解析函数
  parseQuotedOption = value => {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      return value.slice(1, -1);
    return value;
  },

  // 检查时间窗口限制函数
  checkTimeWindowLimit = () => {
    const windowEndTime = timeWindowStart.getTime() + (timeWindow * 1000);
    return Date.now() <= windowEndTime;
  },

  // 解析命令行参数
  argv = yargs(hideBin(process.argv))
    .option('file', {
      alias: 'f',
      type: 'string',
      demandOption: true,
      description: '要作为进程运行的脚本的绝对路径',
      coerce: filePath => path.resolve(filePath),
      check: filePath => {
        if (!fs.existsSync(filePath)) throw new Error(`文件 ${filePath} 不存在或无法找到`);
        return true;
      }
    })
    .option('cwd', {
      alias: 'd',
      type: 'string',
      description: '要作为进程运行的脚本的当前工作目录的绝对路径',
      coerce: cwdPath => cwdPath ? path.resolve(cwdPath) : undefined,
      default: undefined,
      check: cwdPath => {
        if (cwdPath && !fs.existsSync(cwdPath)) throw new Error(`工作目录 ${cwdPath} 不存在`);
        return true;
      }
    })
    .option('log', {
      alias: 'l',
      type: 'string',
      demandOption: true,
      description: '进程日志的描述性名称',
      coerce: parseQuotedOption
    })
    .option('eventlog', {
      alias: 'e',
      type: 'string',
      default: 'APPLICATION',
      description: '事件日志容器;必须是 APPLICATION 或 SYSTEM',
      choices: ['APPLICATION', 'SYSTEM']
    })
    .option('maxretries', {
      alias: 'm',
      type: 'number',
      default: -1,
      description: '进程自动重启的最大次数（-1表示无限制）'
    })
    .option('maxrestarts', {
      alias: 'r',
      type: 'number',
      default: defaultMaxRestarts,
      description: `在${timeWindow}秒内进程应重启的最大次数,超过则关闭`
    })
    .option('wait', {
      alias: 'w',
      type: 'number',
      default: defaultWaitTime,
      description: '每次重启尝试之间的等待秒数',
      check: waitTime => {
        if (waitTime < 0) throw new Error('等待时间不能为负数');
        return true;
      }
    })
    .option('grow', {
      alias: 'g',
      type: 'number',
      default: defaultGrowth,
      description: '等待时间增长的增长百分比（0-1之间）',
      check: growth => {
        if (growth < 0 || growth > 1) throw new Error('增长率必须在0到1之间');
        return true;
      }
    })
    .option('abortonerror', {
      alias: 'a',
      type: 'string',
      default: 'no',
      description: '如果进程因错误失败,是否尝试重启',
      choices: booleanChoices,
      coerce: parseBooleanOption
    })
    .option('stopparentfirst', {
      alias: 's',
      type: 'string',
      default: 'no',
      description: '是否允许脚本使用关闭消息优雅退出',
      choices: booleanChoices,
      coerce: parseBooleanOption
    })
    .option('scriptoptions', {
      type: 'string',
      description: '要传递给脚本的选项（空格分隔）',
      default: '',
      coerce: parseQuotedOption
    }).help().parse();

// 初始化日志记录器
const logger = new EventLogger({
  source: argv.log,
  eventlog: argv.eventlog
}),
  // 进程管理状态
  growthFactor = argv.grow + 1, scriptPath = argv.file;

let waitTime = argv.wait * 1000, restartAttempts = 0, timeWindowStart = null, restartsInWindow = 0, childProcess = null,
  isForceKill = false;

// 设置工作目录-如果没有指定,使用脚本所在目录
if (!argv.cwd) argv.cwd = path.dirname(scriptPath), logger.info(`未指定工作目录,使用脚本所在目录: ${argv.cwd}`);

// 检查工作目录是否存在
if (!fs.existsSync(argv.cwd)) logger.warn(`工作目录 ${argv.cwd} 不存在,使用进程当前目录`), argv.cwd = process.cwd();


// 创建服务器以保持进程运行
let keepAliveServer = net.createServer().listen();

keepAliveServer.on('error', err => {
  logger.warn(`保持活动服务器错误: ${err.message}`), keepAliveServer = net.createServer().listen();
});

/**
 * @returns {Array} 脚本参数数组
 */
const prepareScriptArgs = () => {
  if (!argv.scriptoptions || argv.scriptoptions.trim() === '') return [];

  const args = [], scrOs = argv.scriptoptions;
  let currentArg = '', inQuotes = false, quoteChar = '';

  for (let i = 0; i < scrOs.length; i++) {
    const char = scrOs[i];

    if ((char === '"' || char === "'") && (i === 0 || scrOs[i - 1] !== '\\')) {
      if (!inQuotes) inQuotes = true, quoteChar = char;
      else if (char === quoteChar) inQuotes = false;
      else currentArg += char;
    } else if (char === ' ' && !inQuotes) {
      if (currentArg.trim() !== '') args.push(currentArg.trim()), currentArg = '';
    }
    else currentArg += char;
  }
  if (currentArg.trim() !== '') args.push(currentArg.trim());
  return args.filter(arg => arg !== '');
},

  /**
   * 监控子进程状态,必要时重启
   */
  monitorChildProcess = () => {
    // 如果没有活动的子进程
    if (!childProcess || !childProcess.pid) {
      // 检查时间窗口内的重启次数限制
      if (restartsInWindow >= argv.maxrestarts && timeWindowStart && checkTimeWindowLimit())
        logger.error(`在过去 ${timeWindow} 秒内重启了${restartsInWindow}次,请检查脚本`), process.exit(1);

      // 延迟重启
      setTimeout(() => {
        waitTime *= growthFactor, restartAttempts += 1;

        // 检查总重启次数限制
        if (argv.maxretries >= 0 && restartAttempts > argv.maxretries)
          logger.error(`重启次数过多。${scriptPath} 将不会被重启,已超过最大重启次数 ${argv.maxretries}`), process.exit(1);

        launchProcess('warn', `在意外退出后 ${waitTime} 毫秒重启: 尝试次数=${restartAttempts}`);
      }, waitTime);
    }
    else restartAttempts = 0, waitTime = argv.wait * 1000; // 重置重启计数器和等待时间
  },

  /**
   * 启动子进程
   * @param {string} logLevel - 日志级别（info, warn, error等）
   * @param {string} message - 日志消息
   */
  launchProcess = (logLevel = 'info', message = '') => {
    if (isForceKill) return logger.info('进程已终止');
    if (message) logger[logLevel](message);

    // 初始化或更新时间窗口
    if (!timeWindowStart) {
      timeWindowStart = new Date();

      // 设置时间窗口重置
      setTimeout(() => {
        timeWindowStart = null, restartsInWindow = 0;
      }, timeWindow * 1000 + 1);
    }
    restartsInWindow += 1;

    // 准备子进程选项
    const processOptions = {
      env: { ...process.env }, stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    };

    if (argv.cwd) processOptions.cwd = argv.cwd;
    if (argv.stopparentfirst === 'yes' || argv.stopparentfirst === 'y') processOptions.detached = true;

    // 准备脚本参数
    const scriptArgs = prepareScriptArgs();
    logger.info(`启动子进程: ${scriptPath}`), logger.info(`工作目录: ${argv.cwd}`);
    logger.info(`传递给脚本的参数: ${JSON.stringify(scriptArgs)}`);

    childProcess = fork(scriptPath, scriptArgs, processOptions); // 创建子进程
    // 监听子进程退出事件
    childProcess.on('exit', (code, signal) => {
      const exitMessage = signal ? `${scriptPath} 被信号 ${signal} 终止` : `${scriptPath} 以退出码 ${code} 停止运行`;

      logger.warn(exitMessage);
      // 检查是否需要因错误而终止
      if (code !== 0 && (argv.abortonerror === 'yes' || argv.abortonerror === 'y'))
        logger.error(`${scriptPath} 以错误代码 ${code} 退出，终止包装器进程`), process.exit(code || 1);
      else if (isForceKill) process.exit(0);

      childProcess = null, monitorChildProcess();                              // 重新监控并可能重启
    });

    childProcess.on('error', err => logger.error(`子进程错误: ${err.message}`)); // 监听子进程错误事件
  },

  /**
   * 终止子进程
   */
  terminateChildProcess = () => {
    isForceKill = true;

    if (childProcess) {
      if (argv.stopparentfirst === 'yes' || argv.stopparentfirst === 'y') {
        childProcess.send('shutdown');  // 尝试优雅终止

        // 设置超时强制终止
        setTimeout(() => {
          if (childProcess?.killable) childProcess.kill('SIGKILL');
        }, 5000);
      }
      else childProcess.kill('SIGTERM');
    }
    else logger.warn('尝试终止不存在的子进程');
  };

// 注册进程终止事件处理程序
process.on('exit', terminateChildProcess);
process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在终止...'), terminateChildProcess();
});
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在终止...'), terminateChildProcess();
});

// 处理未捕获异常
process.on('uncaughtException', err => {
  logger.error(`未捕获异常: ${err.message}\n${err.stack}`), launchProcess('warn', err.message);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', reason => logger.error(`未处理的Promise拒绝: ${reason}`));

// 启动主进程
launchProcess('info', `正在启动 ${scriptPath}`);