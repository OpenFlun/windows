import { elevate, sudo, isAdminUser } from './lib/binaries.js';
import { kill, list } from './lib/cmd.js';
import { Service } from './lib/daemon.js';
import { EventLogger } from './lib/eventlog.js';

// =================================== lib/binaries.js ===================================
/**
 * ```js
 * // 文件导出内容
 * elevate();     // 提升当前进程权限（Windows UAC）
 * sudo();        // 使用sudo.exe提升权限（适用于Windows 10及以上版本）
 * isAdminUser(); // 检查当前用户是否拥有管理员权限
 * ```
 * >查看定义:@see {@link elevate}、{@link sudo}、{@link isAdminUser}
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
 * EventLogger{};       // 事件日志记录器类
 * ```
 * >查看定义:@see {@link EventLogger}
 */
declare module './lib/eventlog.js' {
    export * from './lib/eventlog.js';
}

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
    export { elevate, sudo, isAdminUser } from './lib/binaries.js';
    export { kill, list } from './lib/cmd.js';
    export { Service } from './lib/daemon.js';
    export { EventLogger } from './lib/eventlog.js';
}