/**
 * 共享模块,导出在多个文件中使用的常用函数和模块
 * >查看定义:@see {@link exec}、{@link execSync}、{@link fork}、{@link promisify}、{@link path}、{@link fs}、{@link EventEmitter}
 */
import { exec, execSync, fork } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';

/**
 * 将 child_process.exec 包装成 Promise
 * >查看定义:@see {@link execPromise}
 * @type {function(string, Object): Promise<{ stdout: string, stderr: string }>}
 */
const execPromise = promisify(exec);

/**
 * 检查错误是否为权限不足的错误
 * >查看定义:@see {@link isPermissionError}
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
 * >查看定义:@see {@link getDirname}
 * @param {string} metaUrl - 传入 `import.meta.url`
 * @returns {string} 当前模块的目录路径
 */
const getDirname = metaUrl => path.dirname(fileURLToPath(metaUrl));

export { exec, execSync, fork, execPromise, promisify, path, fs, EventEmitter, isPermissionError, getDirname };