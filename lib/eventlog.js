import { exec, execSync, promisify, isPermissionError } from './shared.js';
import { elevate } from './binaries.js';

const execAsync = promisify(exec),
  eventLogs = ['APPLICATION', 'SYSTEM', 'SECURITY'], validTypes = ['ERROR', 'WARNING', 'INFORMATION', 'SUCCESSAUDIT', 'FAILUREAUDIT'];

/**
 * @class flun-windows.EventLogger
 * @since 1.0.1
 * 当前类为事件记录日志工具,方便日志在事件查看器中查看(非C++实现);
 * 创建日志记录器示例：
 *     import {EventLogger} from 'flun-windows';
 *     const log = new EventLogger('Hello World');
 *
 *     log.info('基本信息;')
 *     log.warn('警告信息!');
 *     log.error('发生了错误!!!');
 *
 * 审计成功和失败消息：
 *    log.auditSuccess('用户登录成功');
 *    log.auditFailure('用户登录失败');
 *
 * 每种日志类型（info、warn、error、auditSuccess、auditFailure）方法可接受两个额外参数，
 * 包括一个_代码_和一个_回调函数_;如果未指定,默认事件代码为`1000`;
 * 要提供带有日志消息的自定义事件代码并将该消息写入控制台,可以使用以下代码：
 *     log.info('发生了不同的事情！', 999, ()=>{
 *       console.log('发生了不同的事情！');
 *     });
 *
 * 默认情况下,事件日志都属于`APPLICATION`范围;但是,也可以使用`SYSTEM`等其它日志;
 * 为此,必须将配置对象传递给新的日志记录器：
 *     import {EventLogger} from 'flun-windows';
 *     const log = new EventLogger({
 *       source: '我的事件日志',
 *       eventLog: 'SYSTEM'
 *     });
 */
class EventLogger {
  constructor(config = {}) {
    if (typeof config === 'string') config = { source: config };
    this.#initializeProperties(config);
  }

  #logname = 'APPLICATION';
  #usePowerShellForAudit = false;

  // 初始化属性
  #initializeProperties(config) {
    const { source = 'Node.js', eventLog = 'APPLICATION' } = config;
    this.source = source, this.eventLog = eventLog;
    this.#usePowerShellForAudit = false, this.#checkPowerShellAvailable();
  }

  // 同步检测PowerShell是否可用
  #checkPowerShellAvailable() {
    try {
      execSync('powershell -Command "exit 0"', { stdio: 'ignore' }), this.#usePowerShellForAudit = true;
    } catch (error) {
      this.#usePowerShellForAudit = false;
    }
  }

  // 获取,设置事件日志名称
  get eventLog() {
    return this.#logname.toUpperCase();
  }

  set eventLog(value) {
    if (value) this.#logname = eventLogs.includes(value.toUpperCase()) ? value.toUpperCase() : 'APPLICATION';
  }

  // 兼容创建信息日志的方法(info和warn的全称函数名)
  get information() {
    return this.info.bind(this);
  }

  get warning() {
    return this.warn.bind(this);
  }

  /**
   * 判断是否需要使用PowerShell写入日志
   * @private
   */
  #shouldUsePowerShell(logType, eventId) {
    // 审计类型或事件ID超过1000时使用PowerShell
    const isAuditType = logType === 'SUCCESSAUDIT' || logType === 'FAILUREAUDIT', isEventIdOverLimit = eventId > 1000;
    return this.#usePowerShellForAudit && (isAuditType || isEventIdOverLimit);
  }

  /**
   * 将消息写入日志;如果日志不存在,则创建;
   * @private
   */
  async #write(log = 'APPLICATION', src = '未知应用程序', type = 'INFORMATION', msg, id = 1000, callback) {
    if (!msg || msg.trim().length === 0) return;

    const pMsg = msg.replace(/\r\n|\n\r|\r|\n/g, "\f"),  // 替换换行符
      vLog = eventLogs.includes(log.toUpperCase()) ? log : 'APPLICATION',
      vType = validTypes.includes(type.toUpperCase()) ? type : 'INFORMATION',
      vId = parseInt(id) || 1000, vSrc = src.trim();

    let command;
    // 判断是否需要使用PowerShell
    if (this.#shouldUsePowerShell(vType, vId)) {
      // 使用PowerShell的Write-EventLog命令
      const entryTypeMap = { 'ERROR': 'Error', 'WARNING': 'Warning', 'SUCCESSAUDIT': 'SuccessAudit', 'FAILUREAUDIT': 'FailureAudit' },
        entryType = entryTypeMap[vType] || 'Information', escapedMsg = pMsg.replace(/"/g, '""'),
        powHad = 'powershell -Command "Write-EventLog -LogName';
      command = `${powHad} '${vLog}' -Source '${vSrc}' -EventId ${vId} -EntryType ${entryType} -Message \\\"${escapedMsg}\\\""`;
    } else {
      const eventCreateId = Math.min(Math.max(1, vId), 1000); // 限制在1-1000范围内
      command = `eventcreate /L ${vLog} /T ${vType} /SO "${vSrc}" /D "${pMsg}" /ID ${eventCreateId}`;
    }

    // 执行命令
    try {
      await execAsync(command), callback?.();
    } catch (error) {
      if (isPermissionError(error?.message)) await this.#elevateCommand(command, callback);
      else {
        callback?.(error);
        throw error;
      }
    }
  }

  /**
   * 使用提升权限执行命令
   * @private
   */
  async #elevateCommand(command, callback) {
    return new Promise((resolve, reject) => {
      elevate(command, error => {
        if (error) callback?.(error), reject(error);
        else callback?.(), resolve();
      });
    });
  }

  /**
   * @method info 记录一条信息性消息;
   * @param {String} message 日志消息的内容;
   * @param {Number} [code=1000] 分配给消息的事件代码;
   * @param {Function} [callback] 消息记录后运行的可选回调函数;
   */
  async info(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'INFORMATION', message, code, callback);
  }

  /**
   * @method warn 记录一条警告消息;
   * 其它参数同info方法...;
   */
  async warn(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'WARNING', message, code, callback);
  }

  /**
   * @method error 记录一条错误消息;
   * 其它参数同info方法...;
   */
  async error(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'ERROR', message, code, callback);
  }

  /**
   * @method auditSuccess 记录一条审计成功消息;
   * 其它参数同info方法...;
   */
  async auditSuccess(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'SUCCESSAUDIT', message, code, callback);
  }

  /**
   * @method auditFailure 记录一条审计失败消息;
   * 其它参数同info方法...;
   */
  async auditFailure(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'FAILUREAUDIT', message, code, callback);
  }
}

export { EventLogger };