import { elevate, sudo, isAdminUser, platform } from './lib/binaries.js';
import { kill, list } from './lib/cmd.js';
import { Service } from './lib/daemon.js';
import { EventLogger } from './lib/eventlog.js';
import { exec, execSync, fork, promisify, path, fs, EventEmitter, isPermissionError, getDirname } from './lib/shared.js';
import { generateXml, createExe } from './lib/winsw.js';

// =================================== lib/binaries.js ===================================
/**
 * ```js
 * // 文件导出内容
 * elevate();     // 提升当前进程权限（Windows UAC）
 * sudo();        // 使用sudo.exe提升权限（适用于Windows 10及以上版本）
 * isAdminUser(); // 检查当前用户是否拥有管理员权限
 * platform();    // 获取操作系统平台字符串,用于判断当前运行环境是否为Windows
 * ```
 * >查看定义:@see {@link elevate}、{@link sudo}、{@link isAdminUser}、{@link platform}
 */
declare module './lib/binaries.js' {
    export * from './lib/binaries.js';
}

// =================================== lib/cmd.js ===================================
/**
 * ```js
 * // 文件导出内容
 * kill();              // 结束指定PID进程
 * list();              // 列出服务器上正在运行的进程
 * ```
 * >查看定义:@see {@link kill}、{@link list}
 */
declare module './lib/cmd.js' {
    export * from './lib/cmd.js';
}

// =================================== lib/daemon.js ===================================
/**
 * ```js
 * // 文件导出内容
 * Service{};           // 服务管理类,提供创建、安装、卸载、启动、停止和查询服务状态等功能
 * ```
 * >查看定义:@see {@link Service}
 */
declare module './lib/daemon.js' {
    export * from './lib/daemon.js';
}

// =================================== lib/eventlog.js ===================================
/**
 * ```js
 * // 文件导出内容
 * EventLogger{};       // 事件日志记录器类,用于向Windows事件查看器写入日志
 * ```
 * >查看定义:@see {@link EventLogger}
 */
declare module './lib/eventlog.js' {
    export * from './lib/eventlog.js';
}

// =================================== lib/shared.js ===================================
/**
 * 共享模块,导出在多个文件中使用的常用函数和模块
 * ```js
 * // 外部包函数
 * exec();               // 子进程执行命令的函数,提供回调和Promise两种接口
 * execSync;             // 子进程执行命令的同步函数,返回命令输出结果
 * fork();               // 创建一个新的Node.js子进程来运行指定的模块,提供与父进程的通信通道
 * promisify();          // 将Node.js回调风格的函数转换为返回Promise的函数
 * 模块:
 * path, fs;             // Node.js内置模块,提供文件路径处理、文件系统操作等功能
 * class EventEmitter{}; // Node.js内置模块,提供事件驱动编程的功能,允许对象之间进行事件通信
 * // 自定义函数:
 * isPermissionError();  // 检查错误对象是否表示权限错误的函数,用于判断操作失败是否由于权限不足引起
 * getDirname();         // 获取当前模块目录路径的函数,用于在ES模块环境中替代__dirname变量的功能
 * ```
 * >查看定义:@see {@link exec}、{@link execSync}、{@link fork}、{@link promisify}、{@link path}、{@link fs}、{@link EventEmitter}
 * - 自定义函数:{@link isPermissionError}、{@link getDirname}
 */
declare module './lib/shared.js' {
    export * from './lib/shared.js';
}

// =================================== lib/winsw.js ===================================
/**
 * ```js
 * // 文件导出内容
 * generateXml(); // 生成 winsw 配置文件的 XML;
 * createExe();   // 创建 winsw 可执行文件,将 XML 配置文件和 Node.js 脚本打包成一个独立的 Windows 服务可执行文件;
 * ```
 * >查看定义:@see {@link generateXml}、{@link createExe}
 */
declare module './lib/winsw.js' {
    export * from './lib/winsw.js';
}

// =================================== 模块导出入口 ===================================
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
 * >查看定义:@see {@link Service}、{@link EventLogger}、{@link elevate}、{@link sudo}、{@link isAdminUser}、{@link kill}、{@link list}
 * @example
 *  // 基础示例
 *  import { Service } from '@flun/windows';
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
 */
declare module './index.js' {
    export { elevate, sudo, isAdminUser } from './lib/binaries.js';
    export { kill, list } from './lib/cmd.js';
    export { Service } from './lib/daemon.js';
    export { EventLogger } from './lib/eventlog.js';
}