import { exec, execSync, promisify, path, fs, EventEmitter, isPermissionError, getDirname } from './shared.js';
import { elevate, sudo as binSudo } from './binaries.js';
import { generateXml, createExe } from './winsw.js';
import { EventLogger } from './eventlog.js';

const __dirname = getDirname(import.meta.url), writeFileAsync = promisify(fs.writeFile), mkdirAsync = promisify(fs.mkdir),
  daemonDir = 'daemon', wrapper = path.resolve(path.join(__dirname, './wrapper.js')), nameRegex = /[<>:"\\/|?*]/g;

/**
 * @class flun-windows.Service
 * 此工具可用于将Node.js脚本作为Windows服务进行管理;
 *
 * **请注意,与所有Windows服务一样,创建服务需要管理员权限**;
 * 要使用flun-windows创建服务，请准备如下脚本：
 *     import {Service} from 'flun-windows';
 *
 *      // 创建新的服务对象
 *      const svc = new Service({
 *        name:'Hello World',
 *        description: 'The nodejs.org example web server.',
 *        script: 'C:\\path\\to\\helloworld.js') // 指定要运行的脚本路径,运行后,该服务将在Windows服务程序中可见;
 *      });
 *
 *      // 监听"install"事件,表示进程可作为服务使用;
 *      svc.on('install',() => svc.start());
 *      svc.install();
 *
 * 上述代码创建一个新的`Service`对象，提供友好的名称和描述;
 */
class Service extends EventEmitter {
  constructor(config) {
    super(), this.#validateConfig(config), this.#initializeProperties(config);
  }

  // 验证配置
  #validateConfig(config) {
    if (!config.name || !config.script) throw new Error('服务名称和脚本路径不可为空;');
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
      logOnAs = {}, sudo = {}, // 嵌套配置对象
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

    /**
     * @property {Object} [logOnAs]
     * 如果需要为服务安装后指定特定用户或凭据以登录运行,需设置属性:
     * `domain`、`account`、`password`和`mungeCredentialsAfterInstall`;
     */
    this.logOnAs = {
      account: undefined, password: null, domain, mungeCredentialsAfterInstall: true, ...logOnAs
    };

    // 提升权限配置
    this.sudo = { enabled: null, ...sudo };

    /**
     * @cfg {Array|Object} [env] 为可选数组或对象,用于将环境变量传递给node.js脚本;
     * 可以设置多个环境变量：
     *     const svc = new Service({
     *      name:'Hello World',
     *      description: 'The nodejs.org example web server.',
     *      script: 'C:\\path\\to\\helloworld.js',
     *      env: [{
     *        name: "HOME",value: process.env["USERPROFILE"] // 访问用户主目录
     *      },{
     *        name: "NODE_ENV",value: "production"
     *      }]
     */
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
    // 提取需要的属性
    const { script, scriptOptions, name, grow, wait, maxRestarts, abortOnError, stopparentfirst, maxRetries, id, nodeOptions,
      description, logpath, execPath, logOnAs, workingdirectory, stoptimeout, logmode, env, logging, allowServiceLogon } = this,
      wrapperArgs = ['--file', script, `--scriptoptions=${scriptOptions}`, '--log', `${name} 包装器`, '--grow', grow, '--wait', wait,
        '--maxrestarts', maxRestarts, '--abortonerror', abortOnError ? 'y' : 'n', '--stopparentfirst', stopparentfirst,
        ...(maxRetries !== null ? ['--maxretries', maxRetries] : [])];

    return generateXml({
      name, id, nodeOptions, script: wrapper, scriptOptions, wrapperArgs, description, logpath, execPath, logOnAs, workingdirectory,
      stopparentfirst, stoptimeout, logmode, env, logging, allowServiceLogon
    });
  }

  // 解析脚本保存的目录
  directory(dir) {
    if (dir) this.#directory = path.resolve(dir);
    return path.resolve(path.join(this.#directory, daemonDir));
  }

  #resPath(...paths) {
    return path.resolve(this.root, ...paths);
  }

  /**
   * @property {String} root 进程文件存储的根目录;
   */
  get root() {
    return this.directory();
  }

  /**
   * @property {Logger} log 进程的事件日志记录器实例;
   */
  get log() {
    if (this.#eventlog !== null) return this.#eventlog;
    this.#eventlog = new EventLogger(`${this.name} 监视器`);
    return this.#eventlog;
  }

  /**
   * @property {Number} exists 确定服务是否存在;
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
   * @method install 将脚本安装为进程;
   * @param {String} [dir=脚本的根目录] 进程文件将保存的目录(默认为#script路径);
   * @returns {Promise<void>}
   *
   * @event install 当安装过程完成时触发。
   * @event alreadyinstalled 如果脚本已知并已作为服务安装时触发;
   * @event invalidinstallation 如果检测到安装但缺少必需文件时触发;
   * @event error 在某些错误发生时触发;
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
   * @method uninstall 卸载服务;
   * @param {Number} [waitTime=2] 等待winsw.exe完成卸载命令的秒数;
   * @returns {Promise<void>}
   *
   * @event uninstall 当卸载过程完成时触发;
   * @event alreadyuninstalled 如果脚本未知并作为服务时触发;
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
   * @method start 启动现有服务;
   * @returns {Promise<void>}
   * @event start 当服务启动时触发;
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
   * @method stop 停止服务;
   * @returns {Promise<void>}
   * @event stop 当服务停止时触发;
   * @event alreadystopped 当服务已经停止时触发;
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
   * @method restart 重启现有服务
   * @returns {Promise<void>}
   */
  async restart() {
    this.once('stop', () => this.start()), await this.stop();
  }

  // 使用提升的权限执行命令;
  async #execute(cmd, options = {}) {
    return new Promise((resolve, reject) => {
      // 检查sudo是否为真
      const executor = this.sudo.enabled ? (cmd, opts, cb) => binSudo(cmd, opts, cb) : elevate;
      executor(cmd, { ...options, shell: true, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          if (isPermissionError(error.message)) reject(new Error('权限被拒绝, 请以管理员身份重新运行此脚本;'));
          else console.error(error.toString()), reject(error);
        }
        else resolve({ stdout, stderr });
      });
    });
  }

  /**
   * @param {number} seconds 睡眠秒数
   */
  #sleep = seconds => new Promise(r => setTimeout(r, seconds * 1000));
}

export { Service };