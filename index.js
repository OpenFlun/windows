
import { platform } from './lib/binaries.js';
// 平台检查
if (!platform().startsWith('win')) throw new Error('flun-windows 仅支持在Windows系统上运行');

export { elevate, sudo, isAdminUser } from './lib/binaries.js';
export { kill, list } from './lib/cmd.js';
export { Service } from './lib/daemon.js';
export { EventLogger } from './lib/eventlog.js';