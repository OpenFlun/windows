import { exec, execSync, fork } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

/**
 * 检查错误是否为权限不足的错误
 * @param {string|Error} error - 错误信息或错误对象
 * @returns {boolean} 是否为权限错误
 */
const isPermissionError = error => {
    const errorMessage = error?.message || error?.toString() || String(error),
        permissionErrors = ['拒绝访问', 'Access is denied', '权限不足', 'Insufficient privileges', 'AccessDenied', '需要提升权限',
            'requires elevation', 'Administrator', 'admin', '权限被拒绝'],
        lowerMessage = errorMessage.toLowerCase();
    return permissionErrors.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * 获取当前模块所在目录的路径（类似 CommonJS 的 __dirname）
 * @param {string} metaUrl - 传入 `import.meta.url`
 * @returns {string} 当前模块的目录路径
 */
const getDirname = metaUrl => path.dirname(fileURLToPath(metaUrl));

export { exec, execSync, fork, promisify, path, fs, net, EventEmitter, isPermissionError, getDirname };