// index.d.ts
/**
 * Windows功能模块 主要功能：
 * ```js
 * Service{};           // 服务管理类
 * EventLogger{};       // 事件日志记录器类
 * elevate();           // 权限提升(机制:ShellExecute + "runas")
 * sudo();              // 权限提升(机制:sudo.exe)
 * isAdminUser();       // 检查当前用户是否拥有管理员权限
 * kill();              // 结束指定PID进程
 * list();              // 列出服务器上正在运行的进程
 * ```
 * ---
 *   -
 * ```js
 *  // 基础示例
 *  import { Service } from 'flun-windows';
 *
 *  // 创建服务对象
 *  const svc = new Service({
 *       name: 'Hello World',                  // 服务名称
 *       description: 'nodejs.org 示例服务器',  // 服务描述
 *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
 *
 *       // 传递给node进程的选项
 *       nodeOptions: [ '--harmony','--max-old-space-size=4096' ]
 *   });
 * ```
 *   -
 */
declare module './index.js' {
    import { EventEmitter } from 'events';
    import { ExecOptions } from 'child_process';

    // ============ 基础类型和接口 ============
    /**
     * 子进程执行回调函数类型
     */
    export type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

    /**
     * 进程信息接口
     */
    export interface ProcessInfo {
        /** 进程名称 */
        ImageName: string;
        /** 进程ID */
        PID: string;
        /** 会话名称 */
        SessionName: string;
        /** 会话编号 */
        SessionNumber: string;
        /** 内存使用量 */
        MemoryUsage: string;
        /** 状态（如果verbose=true时显示） */
        Status?: string;
        /** 用户名（如果verbose=true时显示） */
        UserName?: string;
        /** CPU时间（如果verbose=true时显示） */
        CPUTime?: string;
        /** 窗口标题（如果verbose=true时显示） */
        WindowTitle?: string;
    }

    /**
     * 服务登录凭据配置
     */
    export interface LogOnAsConfig {
        /** 登录账户名 */
        account?: string;
        /** 登录密码 */
        password?: string;
        /** 账户所在域 */
        domain?: string;
        /** 安装后是否混淆凭据 */
        mungeCredentialsAfterInstall?: boolean;
    }

    /**
     * 环境变量配置项
     */
    export interface EnvVariable {
        /** 环境变量名 */
        name: string;
        /** 环境变量值 */
        value: string;
    }

    /**
     * 日志配置选项
     */
    export interface LoggingConfig {
        /** 日志模式 */
        mode?: 'append' | 'reset' | 'none' | 'roll-by-time' | 'roll-by-size';
        /** roll-by-time按时间滚动模式 */
        pattern?: string;
        /** roll-by-size按大小滚动模式 */
        sizeThreshold?: number;
        /** roll-by-size模式保留的文件数 */
        keepFiles?: number;
    }

    /**
     * 提升权限配置
     */
    export interface SudoConfig {
        /** 是否启用sudo方式提升权限 */
        enabled?: boolean;
    }

    /**
     * 服务配置选项
     */
    export interface ServiceConfig {
        /** 服务名称（必需） */
        name: string;
        /** 服务脚本路径（必需） */
        script: string;
        /** 服务描述 */
        description?: string;
        /** 服务无响应前的最大重试次数 */
        maxRetries?: number | null;
        /** 60秒内最大重启次数 */
        maxRestarts?: number;
        /** 停止服务的超时时间（秒） */
        stoptimeout?: number;
        /** 脚本停止后等待重新启动的秒数 */
        wait?: number;
        /** 传递给node进程的选项 */
        nodeOptions?: string;
        /** 传递给脚本的选项 */
        scriptOptions?: string;
        /** 是否先停止父进程 */
        stopparentfirst?: boolean;
        /** 遇到错误时是否退出进程 */
        abortOnError?: boolean;
        /** 重启等待时间的增长百分比 */
        grow?: number;
        /** 日志文件路径 */
        logpath?: string | null;
        /** 日志模式 */
        logmode?: 'rotate' | 'truncate' | 'append';
        /** 启动脚本可执行文件的绝对路径 */
        execPath?: string;
        /** 服务进程启动工作目录 */
        workingDirectory?: string;
        /** 服务登录凭据配置 */
        logOnAs?: LogOnAsConfig;
        /** 提升权限配置 */
        sudo?: SudoConfig;
        /** 环境变量配置 */
        env?: EnvVariable[] | Record<string, string>;
        /** 日志配置 */
        logging?: LoggingConfig;
        /** 是否允许服务登录 */
        allowServiceLogon?: boolean;
    }

    // ============ 事件日志记录器类 ============

    /**
     * 事件日志记录器类
     * 用于向Windows事件查看器写入日志
     * ```js
     *  // 配置示例
     *  import { EventLogger } from 'flun-windows';

     *  // 创建日志实例
     *  const log = new EventLogger('服务名称');
     *      log.info('基本信息');
     *      log.warn('警告信息');
     *      log.error('错误信息');
     *      log.auditSuccess('审计成功');
     *      log.auditFailure('审计失败');
     *
     *      // 自定义事件代码
     *      log.error('特殊事件', 1002, ()=>{
     *          console.log('日志已写入');
     *      });
     * ```
     */
    export class EventLogger {
        /**
         * 创建事件日志记录器实例
         * @param config 配置对象或日志源名称
         */
        constructor(config?: string | { source?: string; eventLog?: string });

        /**
         * 事件日志名称
         * 默认: 'APPLICATION'
         */
        eventLog: string;

        /** 日志源名称 */
        source: string;

        /**
         * 记录一条信息性消息
         * @param message 日志消息的内容
         * @param code 分配给消息的事件代码（默认: 1000）
         * @param callback 消息记录后运行的可选回调函数
         */
        info(message: string, code?: number, callback?: (error?: Error) => void): Promise<void>;

        /**
         * info方法的别名
         */
        information: typeof EventLogger.prototype.info;

        /**
         * 记录一条警告消息
         * @param message 日志消息的内容
         * @param code 分配给消息的事件代码（默认: 1000）
         * @param callback 消息记录后运行的可选回调函数
         */
        warn(message: string, code?: number, callback?: (error?: Error) => void): Promise<void>;

        /**
         * warn方法的别名
         */
        warning: typeof EventLogger.prototype.warn;

        /**
         * 记录一条错误消息
         * @param message 日志消息的内容
         * @param code 分配给消息的事件代码（默认: 1000）
         * @param callback 消息记录后运行的可选回调函数
         */
        error(message: string, code?: number, callback?: (error?: Error) => void): Promise<void>;

        /**
         * 记录一条审计成功消息
         * @param message 日志消息的内容
         * @param code 分配给消息的事件代码（默认: 1000）
         * @param callback 消息记录后运行的可选回调函数
         */
        auditSuccess(message: string, code?: number, callback?: (error?: Error) => void): Promise<void>;

        /**
         * 记录一条审计失败消息
         * @param message 日志消息的内容
         * @param code 分配给消息的事件代码（默认: 1000）
         * @param callback 消息记录后运行的可选回调函数
         */
        auditFailure(message: string, code?: number, callback?: (error?: Error) => void): Promise<void>;
    }

    // ============ Windows服务管理类 ============

    /**
     * Windows服务管理类
     * 用于将Node.js脚本作为Windows服务进行管理
     * ```js
     *  // 配置示例
     *  import { Service } from 'flun-windows';
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
     * svc.install();
     * ```
     */
    export class Service extends EventEmitter {
        /**
         * 创建服务实例
         * @param config 服务配置选项
         */
        constructor(config: ServiceConfig);

        /** 服务名称 */
        get name(): string;
        set name(value: string);

        /** 服务ID */
        get id(): string;

        /** 服务是否存在及其状态
         * - 0: 不存在
         * - 1: 存在服务但无文件
         * - 2: 存在文件但无服务
         * - 3: 完整存在
         */
        get exists(): 0 | 1 | 2 | 3;

        /** 服务事件日志记录器实例 */
        get log(): EventLogger;

        /** 进程文件存储的根目录 */
        get root(): string;

        /**
         * 将脚本安装为Windows服务
         * @param dir 服务文件将保存的目录（默认为脚本所在目录）
         * @returns Promise<void>
         * @event install - 当安装过程完成时触发
         * @event alreadyinstalled - 如果服务已安装时触发
         * @event invalidinstallation - 如果检测到安装但缺少必需文件时触发
         * @event error - 在错误发生时触发
         * @example
         * ```js
         *  import { Service } from 'flun-windows';
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
         * ```
         */
        install(dir?: string): Promise<void>;

        /**
         * 卸载服务
         * @param waitTime 等待winsw.exe完成卸载命令的秒数（默认: 2）
         * @returns Promise<void>
         * @event uninstall - 当卸载过程完成时触发
         * @event alreadyuninstalled - 如果服务已卸载时触发
         * @example
         * ```js
         *  import { Service } from 'flun-windows';
         *  const svc = new Service({
         *       name: 'Hello World',                  // 服务名称
         *       description: 'nodejs.org 示例服务器',  // 服务描述
         *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
         *
         *       // 传递给node进程的选项
         *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
         * });
         * ```
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
         * ```
         */
        uninstall(waitTime?: number): Promise<void>;

        /**
         * 启动现有服务
         * @returns Promise<void>
         * @event start - 当服务启动时触发
         * @example
         * ```js
         *  import { Service } from 'flun-windows';
         *  const svc = new Service({
         *       name: 'Hello World',                  // 服务名称
         *       description: 'nodejs.org 示例服务器',  // 服务描述
         *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
         *
         *       // 传递给node进程的选项
         *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
         * });
         * ```
         * svc.on('start', ()=>{
         *   console.log('服务已启动');
         * });
         *
         * svc.start();
         * ```
         */
        start(): Promise<void>;

        /**
         * 停止服务
         * @returns Promise<void>
         * @event stop - 当服务停止时触发
         * @event alreadystopped - 当服务已经停止时触发
         * @example
         * ```js
         *  import { Service } from 'flun-windows';
         *  const svc = new Service({
         *       name: 'Hello World',                  // 服务名称
         *       description: 'nodejs.org 示例服务器',  // 服务描述
         *       script: 'C:\\path\\to\\helloworld.js',// 启动服务的入口脚本路径
         *
         *       // 传递给node进程的选项
         *       nodeOptions: [ '--harmony', '--max-old-space-size=4096' ]
         * });
         * ```
         * svc.on('stop', ()=>{
         *   console.log('服务已停止');
         * });
         *
         * svc.stop();
         * ```
         */
        stop(): Promise<void>;

        /**
         * 重启现有服务
         * @returns Promise<void>
         * @example
         * ```js
         * import { Service } from 'flun-windows';
         * const svc = new Service({
         *   name: 'Hello World',
         *   script: 'C:\\path\\to\\helloworld.js'
         * });
         *
         * svc.restart();
         * ```
         */
        restart(): Promise<void>;

        /**
         * 服务描述
         */
        description: string;

        /**
         * 服务启动脚本的绝对路径
         */
        script: string;

        /**
         * 传递给node进程的选项
         */
        nodeOptions: string;

        /**
         * 传递给脚本的选项
         */
        scriptOptions: string;

        /**
         * 日志文件路径
         */
        logpath: string | null;

        /**
         * 日志模式
         */
        logmode: 'rotate' | 'truncate' | 'append';

        /**
         * 启动脚本可执行文件的绝对路径
         */
        execPath: string;

        /**
         * 服务进程启动工作目录
         */
        workingdirectory: string;

        /**
         * 60秒内最大重启次数
         */
        maxRestarts: number;

        /**
         * 停止服务的超时时间（秒）
         */
        stoptimeout: number;

        /**
         * 是否先停止父进程
         */
        stopparentfirst: boolean;

        /**
         * 遇到错误时是否退出进程
         */
        abortOnError: boolean;

        /**
         * 重启等待时间的增长百分比
         */
        grow: number;

        /**
         * 脚本停止后等待重新启动的秒数
         */
        wait: number;

        /**
         * 服务无响应前的最大重试次数
         */
        maxRetries: number | null;

        /**
         * 服务登录凭据配置
         */
        logOnAs: LogOnAsConfig;

        /**
         * 提升权限配置
         */
        sudo: SudoConfig;

        /**
         * 环境变量配置
         */
        env: EnvVariable[] | Record<string, string> | undefined;

        /**
         * 日志配置
         */
        logging: LoggingConfig | undefined;

        /**
         * 是否允许服务登录
         */
        allowServiceLogon: boolean | undefined;
    }

    // ============ 基础功能函数 ============

    /**
     * 提升当前进程权限（Windows UAC）
     * @param cmd 要使用提升权限执行的命令
     * @param options 传递给child_process.exec的选项
     * @param callback 执行完成后的回调函数
     * @example
     * ```js
     * import { elevate  } from 'flun-windows';
     *
     * // 基本用法
     * elevate('echo "Hello World" && whoami',{}, (error, stdout, stderr) => {
     *     if (error) {
     *         console.error('执行失败:', error);
     *     } else {
     *         console.log('执行成功，输出:', stdout);
     *         console.log('错误输出:', stderr);
     *     }
     * });
     *
     * // 带选项参数
     * elevate('echo "Hello World" && whoami', { cwd:'C:\\' }, callback);
     *
     * // 多种参数组合
     * elevate('echo "Hello World" && whoami', (err, stdout)=> { }); // options视为回调
     * elevate('echo "Hello World" && whoami'); // 无回调
     * ```
     */
    export function elevate(
        cmd: string,
        options?: ExecOptions | ExecCallback,
        callback?: ExecCallback
    ): void;

    /**
     * 使用sudo方式提升权限（与elevate相似但体验更好）
     * @param cmd 要使用提升权限执行的命令
     * @param options 传递给child_process.exec的选项
     * @param callback 执行完成后的回调函数
     * @example
     * ```js
     * import { sudo } from 'flun-windows';
     *
     * // 基本用法 - 命令、选项和回调
     * sudo('echo "Hello World" && whoami', {}, (error, stdout, stderr) => {
     *     if (error) {
     *         console.error('执行失败:', error);
     *     } else {
     *         console.log('执行成功，输出:', stdout);
     *         console.log('错误输出:', stderr);
     *     }
     * });
     *
     * // 带选项参数
     * sudo('echo "Hello World" && whoami', {cwd:'C:\\'}, callback);
     *
     * sudo('echo "Hello World" && whoami' ); // 无回调
     * ```
     */
    export function sudo(
        cmd: string,
        options?: ExecOptions | ExecCallback,
        callback?: ExecCallback
    ): void;

    /**
     * 检查当前用户是否拥有管理员权限
     * @param callback 回调函数，接收布尔值表示是否为管理员
     * @example
     * ```js
     * import { isAdminUser  } from 'flun-windows';
     * isAdminUser(isAdmin => {
     *   if (isAdmin) console.log('当前用户是管理员');
     *   else console.log('当前用户不是管理员');
     * });
     * ```
     */
    export function isAdminUser(callback: (isAdmin: boolean) => void): void;

    /**
     * 结束指定进程
     * @param pid 进程PID
     * @param callback 执行完成后的回调函数
     * @param force 是否强制结束进程（默认: false）
     * @example
     * ```js
     * import { kill } from 'flun-windows';
     *  kill(进程PID, () => {
     *    console.log('进程已终止');
     *  });
     * ```
     */
    export function kill(
        pid: number,
        callback?: ExecCallback,
        force?: boolean
    ): void;

    /**
     * 列出服务器上正在运行的进程
     * @param callback 回调函数，接收进程对象数组
     * @param verbose 是否显示详细信息（默认: false）
     * @example
     * ```js
     * import { list } from 'flun-windows';
     *  list(processes => {
     *    console.log(processes);
     *  }, true); // true 显示详细信息
     * ```
     */
    export function list(
        callback: (processes: ProcessInfo[]) => void,
        verbose?: boolean
    ): void;
}