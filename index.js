/**
 * @module flun-windows 模块入口文件
 * @description 提供Windows特定功能,如提升权限、事件日志记录和服务管理
 * @author Corey Butler
 */
import { platform } from './lib/binaries.js';
// 平台检查
if (!platform().startsWith('win')) throw new Error('flun-windows 仅支持在Windows系统上运行');

export { elevate, sudo, isAdminUser } from './lib/binaries.js';
export { kill, list } from './lib/cmd.js';
export { Service } from './lib/daemon.js';
export { EventLogger } from './lib/eventlog.js';