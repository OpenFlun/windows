import { exec, execSync, promisify, isPermissionError } from './shared.js';
import { elevate } from './binaries.js';

const execAsync = promisify(exec),
  eventLogs = ['APPLICATION', 'SYSTEM', 'SECURITY'], validTypes = ['ERROR', 'WARNING', 'INFORMATION', 'SUCCESSAUDIT', 'FAILUREAUDIT'];

/**
 * 事件日志记录器类,用于向Windows事件查看器写入日志
 * - 提供记录信息、警告、错误和审计成功、审计失败事件的方法
 * >查看定义:@see {@link EventLogger}、{@link info}、{@link warn}、{@link error}、{@link auditSuccess}、{@link auditFailure}
 * @class EventLogger
 * @example
 *  // 配置示例
 *  import { EventLogger } from 'flun-windows';
 *
 *  // 创建日志实例
 *  const log = new EventLogger('服务名称');
 *  log.info('基本信息');
 *  log.warn('警告信息');
 *  log.error('错误信息');
 *  log.auditSuccess('审计成功');
 *  log.auditFailure('审计失败');
 *
 *  // 自定义事件代码
 *  log.error('特殊事件', 1002, ()=>{
 *      console.log('日志已写入');
 *  });
 */
class EventLogger {
  /**
   * @constructor
   * @param {string|Object} [config] - 配置字符串（作为 source）或配置对象
   * @param {string} [config.source='Node.js'] - 事件源名称
   * @param {string} [config.eventLog='APPLICATION'] - 事件日志名称（APPLICATION, SYSTEM, SECURITY）
   */
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

  /**
   * 获取当前事件日志名称（大写）
   * @returns {string}
   */
  get eventLog() {
    return this.#logname.toUpperCase();
  }

  /**
   * 设置事件日志名称,仅允许 APPLICATION, SYSTEM, SECURITY
   * @param {string} value - 事件日志名称
   */
  set eventLog(value) {
    if (value) this.#logname = eventLogs.includes(value.toUpperCase()) ? value.toUpperCase() : 'APPLICATION';
  }

  /**
   * info方法的别名
   * @returns {(message: string, code?: number, callback?: (error?: Error|null) => void) => Promise<void>}
   */
  get information() {
    return this.info.bind(this);
  }

  /**
   * warn方法的别名
   * @returns {(message: string, code?: number, callback?: (error?: Error|null) => void) => Promise<void>}
   */
  get warning() {
    return this.warn.bind(this);
  }

  /**
   * 判断是否需要使用PowerShell写入日志
   * @private
   * @param {string} logType - 日志类型
   * @param {number} eventId - 事件ID
   * @returns {boolean}
   */
  #shouldUsePowerShell(logType, eventId) {
    // 审计类型或事件ID超过1000时使用PowerShell
    const isAuditType = logType === 'SUCCESSAUDIT' || logType === 'FAILUREAUDIT', isEventIdOverLimit = eventId > 1000;
    return this.#usePowerShellForAudit && (isAuditType || isEventIdOverLimit);
  }

  /**
   * 将消息写入日志;如果日志不存在,则创建;
   * @private
   * @param {string} [log='APPLICATION'] - 日志名称
   * @param {string} [src='未知应用程序'] - 事件来源
   * @param {string} [type='INFORMATION'] - 日志类型
   * @param {string} msg - 消息内容
   * @param {number} [id=1000] - 事件ID
   * @param {(error?: Error|null) => void} [callback] - 完成后的回调函数
   * @returns {Promise<void>}
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
   * @param {string} command - 要执行的命令
   * @param {(error?: Error|null) => void} [callback] - 完成回调
   * @returns {Promise<void>}
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
   * 记录一条信息性消息
   * >查看定义:@see {@link info}
   * @param {string} message - 日志消息的内容
   * @param {number} [code=1000] - 分配给消息的事件代码
   * @param {(error?: Error|null) => void} [callback] - 消息记录后运行的可选回调函数
   * @returns {Promise<void>}
   */
  async info(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'INFORMATION', message, code, callback);
  }

  /**
   * 记录一条警告消息
   * >查看定义:@see {@link warn}
   * @param {string} message - 日志消息的内容
   * @param {number} [code=1000] - 分配给消息的事件代码
   * @param {(error?: Error|null) => void} [callback] - 消息记录后运行的可选回调函数
   * @returns {Promise<void>}
   */
  async warn(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'WARNING', message, code, callback);
  }

  /**
   * 记录一条错误消息
   * >查看定义:@see {@link error}
   * @param {string} message - 日志消息的内容
   * @param {number} [code=1000] - 分配给消息的事件代码
   * @param {(error?: Error|null) => void} [callback] - 消息记录后运行的可选回调函数
   * @returns {Promise<void>}
   */
  async error(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'ERROR', message, code, callback);
  }

  /**
   * 记录一条审计成功消息
   * >查看定义:@see {@link auditSuccess}
   * @param {string} message - 日志消息的内容
   * @param {number} [code=1000] - 分配给消息的事件代码
   * @param {(error?: Error|null) => void} [callback] - 消息记录后运行的可选回调函数
   * @returns {Promise<void>}
   */
  async auditSuccess(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'SUCCESSAUDIT', message, code, callback);
  }

  /**
   * 记录一条审计失败消息
   * >查看定义:@see {@link auditFailure}
   * @param {string} message - 日志消息的内容
   * @param {number} [code=1000] - 分配给消息的事件代码
   * @param {(error?: Error|null) => void} [callback] - 消息记录后运行的可选回调函数
   * @returns {Promise<void>}
   */
  async auditFailure(message, code = 1000, callback) {
    await this.#write(this.eventLog, this.source, 'FAILUREAUDIT', message, code, callback);
  }
}

export { EventLogger };