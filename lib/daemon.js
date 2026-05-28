import { execSync, execPromise, promisify, path, fs, EventEmitter, isPermissionError, getDirname } from './shared.js';
import { elevate, sudo } from './binaries.js';
import { generateXml, createExe } from './winsw.js';
import { EventLogger } from './eventlog.js';

const __dirname = getDirname(import.meta.url), writeFileAsync = promisify(fs.writeFile), mkdirAsync = promisify(fs.mkdir),
  daemonDir = 'daemon', wrapper = path.resolve(path.join(__dirname, './wrapper.js')), nameRegex = /[<>:"\\/|?*]/g;

/**
 * Windows服务管理类,提供创建、安装、卸载、启动、停止、重启和查询服务状态等功能
 * - 用于将Node.js脚本作为Windows服务运行,支持自动重启、日志记录和权限提升等功能
 * >查看定义:@see {@link Service}、{@link install}、{@link uninstall}、{@link start}、{@link stop}、{@link restart}、{@link exists}
 * @example
 *  // 配置示例
 *  import { Service } from '@flun/windows';
 *
 *  // 创建服务对象
 *  const svc = new Service({
 *       name: 'Hello World',                  // 服务名称
 *       description: 'nodejs.org 示例服务器',  // 服务描述
 *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
 *
 *       // 传递给node进程的选项
 *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
 *   });
 * svc.install();   // 安装服务
 * // svc.start();     // 启动服务
 * // svc.stop();      // 停止服务
 * // svc.uninstall(); // 卸载服务
 */
class Service extends EventEmitter {
  /**
   * 创建服务实例
   * @param {Object} config - 服务配置
   * @param {string} config.name - 服务名称
   * @param {string} config.script - 启动服务的入口脚本路径
   * @param {number} [config.maxRetries=null] - 服务无响应/故障之前的最大重试次数(默认忽略)
   * @param {number} [config.maxRestarts=3] - 在60秒内最大重启次数(0表示不启用),超过则停止进程
   * @param {number} [config.stoptimeout=30] - 停止服务的超时秒数
   * @param {number} [config.wait=1] - 脚本停止后等待重新启动的秒数
   * @param {string} [config.nodeOptions='--harmony'] - 传递给node进程的选项
   * @param {string} [config.scriptOptions=''] - 传递给脚本的选项
   * @param {boolean} [config.stopparentfirst=false] - 是否先停止父进程
   * @param {boolean} [config.abortOnError=false] - 脚本运行错误时是否退出进程
   * @param {number} [config.grow=0.25] - 重启等待时间的增长百分比
   * @param {string|null} [config.logpath=null] - 日志文件路径(默认与可执行文件相同目录)
   * @param {string} [config.logmode='rotate'] - 日志模式(rotate, truncate, append)
   * @param {string} [config.description=''] - 服务描述
   * @param {string} [config.execPath=process.execPath] - 可执行文件路径
   * @param {string} [config.workingDirectory=process.cwd()] - 服务进程工作目录
   * @param {Object} [config.logOnAs] - 服务登录凭据配置
   * @param {string} [config.logOnAs.account] - 登录账户
   * @param {string|null} [config.logOnAs.password] - 登录密码
   * @param {string} [config.logOnAs.domain] - 域名(默认使用COMPUTERNAME)
   * @param {boolean} [config.logOnAs.mungeCredentialsAfterInstall=true] - 安装后是否混淆凭据
   * @param {Object} [config.env] - 环境变量配置
   * @param {Object} [config.logging] - 日志配置
   * @param {boolean} [config.allowServiceLogon] - 是否允许服务登录
   */
  constructor(config) {
    super(), this.#validateConfig(config), this.#initializeProperties(config);
  }

  /**
   *验证配置
   * @param {Object} config - 服务配置对象
   */
  #validateConfig(config) {
    if (!config.name || !config.script) throw new Error('服务名称和脚本路径不可为空;')
  }

  // 私有字段
  #name = null;
  #eventlog;
  #directory;

  // 名称过滤方法
  #filterName(name) {
    return name ? name.replace(nameRegex, '') : console.log('服务名称无效');
  }

  // 初始化属性
  #initializeProperties(config) {
    const {
      // 基础配置
      name, script, maxRetries = null, maxRestarts = 3, stoptimeout = 30, wait = 1, nodeOptions = '--harmony',
      scriptOptions = '', stopparentfirst = false, abortOnError = false, grow = 0.25, logpath = null, logmode = 'rotate',
      description = '', execPath = process.execPath, workingDirectory = process.cwd(),
      logOnAs = {},// 嵌套配置对象
      env, logging, allowServiceLogon,    // 其它配置
    } = config, domain = process.env.COMPUTERNAME;

    // 私有字段
    this.#name = this.#filterName(name), this.#eventlog = null, this.#directory = script ? path.dirname(script) : null;

    // 公共属性
    this.maxRetries = maxRetries;                            // 服务无响应/故障之前的最大重试次数(默认忽略);
    this.maxRestarts = maxRestarts;                          // 在60秒内最大重启次数(0表示不启用),超过则停止进程;
    this.stoptimeout = stoptimeout;                          // 停止服务的超时时间(默认:30秒);
    this.wait = Number(wait);                                // 脚本停止后等待重新启动的秒数(默认:1秒);
    this.nodeOptions = nodeOptions;                          // 传递给node进程的选项;
    this.scriptOptions = scriptOptions;                      // 传递给脚本的选项;

    this.stopparentfirst = stopparentfirst;                  // 是否先停止父进程(默认:false);
    this.abortOnError = Boolean(abortOnError);               // 当遇到导致node.js脚本无法运行错误时是否退出进程(默认:false);
    this.grow = Number(grow);                                // 重启等待时间的增长百分比(默认:0.25);
    this.logpath = logpath;                                  // 日志文件路径(默认:与可执行文件相同的目录);
    this.logmode = logmode;                                  // 日志模式(默认:rotate);可选值: rotate, truncate, append;
    this.description = description;                          // 服务描述;
    this.script = path.resolve(script);                      // 服务启动脚本的绝对路径;
    this.execPath = path.resolve(execPath);                  // 启动脚本可执行文件的绝对路径;
    this.workingdirectory = workingDirectory;                // 服务进程启动工作目录的完整路径(默认:当前工作目录);

    /** 服务登录凭据配置 */
    this.logOnAs = {
      account: undefined, password: null, domain, mungeCredentialsAfterInstall: true, ...logOnAs
    };

    /** 环境变量配置 */
    this.env = env, this.logging = logging, this.allowServiceLogon = allowServiceLogon;
  }

  // 进程名称
  get name() {
    return this.#name;
  }

  set name(value) {
    this.#name = this.#filterName(value);
  }

  // 进程ID
  get id() {
    return this.name;
  }

  // 可执行文件名
  get #exe() {
    return `${this.id}.exe`;
  }

  // 服务名称（用于Windows服务管理）
  get #serviceName() {
    return this.id;
  }

  // 生成服务的XML配置
  get #xml() {
    const { script, scriptOptions, name, grow, wait, maxRestarts, abortOnError, stopparentfirst, maxRetries, id, nodeOptions,
      description, logpath, execPath, logOnAs, workingdirectory, stoptimeout, logmode, env, logging, allowServiceLogon } = this;

    // 构建环境变量数组,自动添加 USERPROFILE（如果未显式设置）
    let envList = [];
    if (env) envList.push(...(Array.isArray(env) ? env : [env]));
    if (process.env.USERPROFILE && !envList.some(e => e.name === 'USERPROFILE'))
      envList.push({ name: 'USERPROFILE', value: process.env.USERPROFILE });

    const wrapperArgs = ['--file', script, `--scriptoptions=${scriptOptions}`, '--log', `${name} 包装器`, '--grow', grow, '--wait', wait,
      '--maxrestarts', maxRestarts, '--abortonerror', abortOnError ? 'y' : 'n', '--stopparentfirst', stopparentfirst,
      ...(maxRetries !== null ? ['--maxretries', maxRetries] : [])];

    return generateXml({
      name, id, nodeOptions, script: wrapper, scriptOptions, wrapperArgs, description, logpath, execPath, logOnAs, workingdirectory,
      stopparentfirst, stoptimeout, logmode, env: envList, logging, allowServiceLogon
    });
  }

  /**
   * 解析脚本保存的目录
   * @param {string} [dir] - 自定义目录路径,若不提供则使用脚本所在目录
   * @returns {string} 服务文件的完整保存目录
   */
  directory(dir) {
    if (dir) this.#directory = path.resolve(dir);
    return path.resolve(path.join(this.#directory, daemonDir));
  }

  #resPath(...paths) {
    return path.resolve(this.root, ...paths);
  }

  /**
   * 进程文件存储的根目录
   * @returns {string}
   */
  get root() {
    return this.directory();
  }

  /**
   * 服务事件日志记录器实例
   * @returns {EventLogger}
   */
  get log() {
    if (this.#eventlog !== null) return this.#eventlog;
    this.#eventlog = new EventLogger(`${this.name} 监视器`);
    return this.#eventlog;
  }

  /**
   * 服务是否存在及其状态
   * - 0: 不存在
   * - 1: 存在服务但无文件
   * - 2: 存在文件但无服务
   * - 3: 完整存在
   * >查看定义:@see {@link exists}
   * @returns {number} 状态码 0-3
   */
  get exists() {
    const hasFiles = fs.existsSync(this.#resPath(`${this.id}.exe`)) && fs.existsSync(this.#resPath(`${this.id}.xml`));
    try {
      execSync(`sc query "${this.#serviceName}"`, { stdio: 'ignore' });
      return hasFiles ? 3 : 1;
    } catch {
      return hasFiles ? 2 : 0;
    }
  }

  /**
   * 将脚本安装为Windows服务
   * >查看定义:@see {@link install}
   * @param {string} [dir] - 服务文件将保存的目录（默认为脚本所在目录）
   * @returns {Promise<void>}
   * @event install - 当安装过程完成时触发
   * @event alreadyinstalled - 如果服务已安装时触发
   * @event invalidinstallation - 如果检测到安装但缺少必需文件时触发
   * @event error - 在错误发生时触发
   * @example
   *  import { Service } from '@flun/windows';
   *  const svc = new Service({
   *       name: 'Hello World',                  // 服务名称
   *       description: 'nodejs.org 示例服务器',  // 服务描述
   *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
   *
   *       // 传递给node进程的选项
   *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
   * });
   *
   * // 监听安装完成事件
   * svc.on('install', ()=>{
   *   svc.start();
   * });
   *
   * svc.install();
   */
  async install(dir) {
    // 检查是否已安装
    if (this.exists === 3) return console.log('安装跳过,服务已经存在;'), this.emit('alreadyinstalled');

    const targetDir = this.directory(dir);
    if (!fs.existsSync(targetDir)) await mkdirAsync(targetDir, { recursive: true });
    try {
      // 写入配置文件&创建可执行文件
      await writeFileAsync(this.#resPath(`${this.id}.xml`), this.#xml);
      await new Promise((resolve, reject) => {
        createExe(this.id, targetDir, error => error ? reject(error) : resolve());
      });

      // 执行安装命令
      await this.#execute(`"${this.#resPath(this.#exe)}" install`), await this.#sleep(2), this.emit('install');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 卸载服务
   * >查看定义:@see {@link uninstall}
   * @param {number} [waitTime=2] - 等待winsw.exe完成卸载命令的秒数
   * @returns {Promise<void>}
   * @event uninstall - 当卸载过程完成时触发
   * @event alreadyuninstalled - 如果服务已卸载时触发
   * @example
   *  import { Service } from '@flun/windows';
   *  const svc = new Service({
   *       name: 'Hello World',                  // 服务名称
   *       description: 'nodejs.org 示例服务器',  // 服务描述
   *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
   *
   *       // 传递给node进程的选项
   *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
   * });
   * svc.on('uninstall', ()=>{
   *   console.log('卸载完成');
   *   console.log('服务是否存在：', svc.exists);
   *   // svc.exists 返回值说明：
   *   // 0: 服务和相关文件没有
   *   // 1: 服务已注册但相关文件不存在（异常情况）
   *   // 2: 服务未注册但相关文件存在（文件残留）
   *   // 3: 服务已注册且相关文件存在（正常状态）
   * });
   *
   * svc.uninstall();
   */
  async uninstall(waitTime = 2) {
    if (!this.exists) return console.log('卸载已跳过,服务已经不在;'), this.emit('alreadyuninstalled');

    const uninstaller = async () => {
      await this.#execute(`"${this.#resPath(this.#exe)}" uninstall`), await this.#sleep(waitTime);
      try {
        await fs.promises.rm(this.root, { recursive: true, force: true }), await this.#sleep(1);
      } catch (error) {
        console.error(`删除目录失败: ${error.message}`);
      }

      this.emit('uninstall');
    };

    this.once('stop', uninstaller), this.once('alreadystopped', uninstaller), await this.stop();
  }

  /**
   * 启动现有服务
   * >查看定义:@see {@link start}
   * @returns {Promise<void>}
   * @event start - 当服务启动时触发
   * @example
   *  import { Service } from '@flun/windows';
   *  const svc = new Service({
   *       name: 'Hello World',                  // 服务名称
   *       description: 'nodejs.org 示例服务器',  // 服务描述
   *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
   *
   *       // 传递给node进程的选项
   *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
   * });
   * svc.on('start', ()=>{
   *   console.log('服务已启动');
   * });
   *
   * svc.start();
   */
  async start() {
    if (this.exists !== 3) throw new Error(`启动 ${this.name} 服务条件缺失(exists返回码:${this.exists});`);

    try {
      const { stderr } = await this.#execute(`NET START "${this.#serviceName}"`);
      if (!stderr) return this.emit('start'); // 如果没有错误,触发成功事件
      throw new Error(stderr);
    } catch (error) {
      if (error.message.includes('already been started')) return this.log.warn('尝试启动服务失败,因为服务已经在运行;');
      this.emit('error', error);
    }
  }

  /**
   * 停止服务
   * >查看定义:@see {@link stop}
   * @returns {Promise<void>}
   * @event stop - 当服务停止时触发
   * @event alreadystopped - 当服务已经停止时触发
   * @example
   *  import { Service } from '@flun/windows';
   *  const svc = new Service({
   *       name: 'Hello World',                  // 服务名称
   *       description: 'nodejs.org 示例服务器',  // 服务描述
   *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
   *
   *       // 传递给node进程的选项
   *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
   * });
   * svc.on('stop', ()=>{
   *   console.log('服务已停止');
   * });
   *
   * svc.stop();
   */
  async stop() {
    try {
      await this.#execute(`NET STOP "${this.#serviceName}"`), this.emit('stop');
    } catch (error) {
      if (error.code === 2) return this.log.warn('服务未运行或已停止;'), this.emit('alreadystopped');
      this.emit('error', error);
    }
  }

  /**
   * 重启现有服务
   * >查看定义:@see {@link restart}
   * @returns {Promise<void>}
   * @example
   * import { Service } from '@flun/windows';
   * const svc = new Service({
   *   name: 'Hello World',
   *   script: 'C:\\path\\to\\helloworld.js'
   * });
   *
   * svc.restart();
   */
  async restart() {
    this.once('stop', () => this.start()), await this.stop();
  }

  /**
   * 使用提升的权限执行命令
   * @param {string} cmd - 要执行的命令
   * @param {Object} [options={}] - 额外执行选项
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  async #execute(cmd, options = {}) {
    // 检查 sudo 是否启用,并根据可用性选择提升方法
    const isSudoAvailableOnWindows = async () => {
      try {
        await execPromise('sudo --version', { shell: true });
        return true;
      } catch { return false }
    }, sudoAvailable = await isSudoAvailableOnWindows(), executor = sudoAvailable ? sudo : elevate;

    return new Promise((resolve, reject) => {
      executor(cmd, { ...options, shell: true, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          if (isPermissionError(error.message)) reject(new Error('权限被拒绝,请以管理员身份重新运行此脚本;'));
          else console.error(error.toString()), reject(error);
        }
        else resolve({ stdout, stderr });
      });
    });
  }

  /**
   * 睡眠指定秒数
   * @param {number} seconds - 睡眠秒数
   * @returns {Promise<void>}
   */
  #sleep = seconds => new Promise(r => setTimeout(r, seconds * 1000));
}

export { Service };