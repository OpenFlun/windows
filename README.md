# flun-windows

本工具库能将您的 Node.js 应用程序作为 Windows 后台服务来运行和管理,支持服务的安装、启动、停止及卸载全流程；还提供事件日志等功能,它主要用于面向生产环境应用程序的部署与运维；如需联系，邮箱: [cn@flun.top](mailto:cn@flun.top)

### 本包基于 ESM 模块系统编写->拥抱未来趋势

- **推荐方式**：使用 `import` / `export` 语法,静态分析更友好,工具链兼容性最佳;
- **兼容方式**：Node.js ≥ 23.5.0 原生支持 `require(esm)`；22.12+ 需开启 `--experimental-require-module` 标志;
- **重要**：本文档所有示例均采用 **ESM 标准**，请确保你的项目 `package.json` 中已设置 `"type": "module"`，或将脚本后缀改为 `.mjs`;

## 功能概述

flun-windows 提供以下功能：

- **服务管理**：将 Node.js 脚本作为原生 Windows 服务运行（含监控功能）
- **事件日志**：写入 Windows 事件日志
- **系统命令**：
  - _权限提升_：以管理员权限运行命令(会触发 UAC 确认)
  - _Sudo 执行_：以管理员身份执行命令
  - _权限检测_：检测当前用户是否具有管理员权限
  - _进程列表_：列出运行中的 Windows 进程/服务
  - _终止进程_：通过 PID 终止特定进程

## 安装

推荐通过 npm 全局安装：`npm i -g flun-windows`

然后在项目根目录执行：`npm link flun-windows`

局部安装:`npm i flun-windows`

## 无原生模块依赖

Windows 上的原生 Node 模块安装复杂，通常需要 Visual Studio 和 node-gyp 进行编译；flun-windows **不依赖任何原生模块**，所有二进制工具均已预打包，无需安装 Visual Studio 等编译环境；

---

# Windows 服务管理

flun-windows 可将 Node.js 脚本转换为 Windows 服务；注意：创建服务需要管理员权限！！

基础示例：

```js
import { Service } from 'flun-windows';

// 创建服务对象
const svc = new Service({
  name: 'Hello World',
  description: 'nodejs.org 示例服务器',
  script: 'C:\\path\\to\\helloworld.js',
  nodeOptions: [
    '--harmony',
    '--max-old-space-size=4096'
  ]
  // ===== 其它可选配置 =====
  //, maxRetries: null             // 最大重试次数（默认null，表示忽略）
  //, maxRestarts: 3               // 60秒内最大重启次数（默认3）
  //, stoptimeout: 30              // 停止服务超时时间（秒，默认30）
  //, wait: 1                      // 重启等待时间（秒，默认1）
  //, scriptOptions: ''            // 传递给脚本的参数（默认空字符串）
  //, stopparentfirst: false       // 是否先停止父进程（默认false）
  //, abortOnError: false          // 遇到错误是否退出进程（默认false）
  //, grow: 0.25                   // 重启等待时间增长比例（默认0.25即25%）
  //, logpath: null                // 日志文件路径（默认null，使用默认路径）
  //, logmode: 'rotate'            // 日志模式（'reset', 'roll', 'append'）
  //, execPath: process.execPath   // Node.js可执行文件路径（默认当前Node）
  //, logOnAs: {}                  // 服务运行的用户凭据（'domain'、'account'、'password'和'mungeCredentialsAfterInstall'）
  //, sudo: {enabled:false}        // 提升权限配置（是否在Windows启用了sudo,默认没有）
  //, env: undefined               // 环境变量（默认:undefined）
  //, logging: null                // 日志配置（默认:mode = 'append', pattern = 'yyyMMdd', sizeThreshold = 10240, keepFiles = 8）
  //, allowServiceLogon: undefined // 允许服务登录（默认undefined）
  //, workingDirectory: process.cwd() // 工作目录（默认当前目录）
});

// 监听安装完成事件
svc.on('install', ()=>{
  svc.start();
});

svc.install();
```

服务创建后可通过 Windows 服务管理器、`NET START/STOP` 或 `sc` 命令管理。

### 支持的事件

- _install_ - 服务安装完成
- _alreadyinstalled_ - 服务已存在
- _invalidinstallation_ - 安装文件不完整
- _uninstall_ - 卸载完成
- _alreadyuninstalled_ - 服务未安装
- _start_ - 服务启动
- _stop_ - 服务停止
- _error_ - 发生错误

### 脚本参数传递

通过 `scriptOptions` 配置：

```js
import { Service } from 'flun-windows';
const svc1 = new Service({
  ...,          // 基本配置略...
  scriptOptions: '-c C:\\config\\special.conf -i'
});
```

### 环境变量设置

```js
import { Service } from 'flun-windows';
const svc1 = new Service({
  ...,          // 基本配置略...
  env: {
    name: "HOME",
    value: process.env["USERPROFILE"]
  }
});

// 或多个变量
const svc2 = new Service({
  ...,          // 基本配置略...
  env: [{
    name: "HOME",
    value: process.env["USERPROFILE"]
  },{
    name: "TEMP",
    value: path.join(process.env["USERPROFILE"],"/temp")
  }]
});
```

### 指定 Node 执行路径

```js
import { Service } from 'flun-windows';
const svc = new Service({
  ...,          // 基本配置略...
  execPath: 'C:\\特定路径\\node.exe'
});
```

### 用户账户配置

```js
import { Service } from 'flun-windows';
const svc = new Service({
  ...,          // 基本配置略...
});

// 安装后指定特定用户或凭据以登录运行
svc.logOnAs.domain = 'mydomain.local';
svc.logOnAs.account = 'username';
svc.logOnAs.password = 'password';
svc.logOnAs.mungeCredentialsAfterInstall: true // 默认

// 显示启用 sudo 提权 (注意!!需要在系统中启用了sudo,然后在这里设置为true,才有效)
svc.sudo.enabled = true;
```

### 服务卸载

```js
import { Service } from 'flun-windows';
const svc = new Service({
  ...,          // 基本配置略...
});
svc.on('uninstall', ()=>{
  console.log('卸载完成');
  console.log('服务是否存在：', svc.exists);
  // svc.exists 返回值说明：
  // 0: 服务和相关文件没有
  // 1: 服务已注册但相关文件不存在（异常情况）
  // 2: 服务未注册但相关文件存在（文件残留）
  // 3: 服务已注册且相关文件存在（正常状态）
});

svc.uninstall();
```

注：卸载仅移除服务相关文件，**不会删除您的 Node.js 脚本**；

### 智能重启机制

flun-windows 提供可配置的重启策略：

```js
import { Service } from 'flun-windows';
const svc = new Service({
  ...,          // 基本配置略...
  wait: 2,      // 初始等待时间（秒）
  grow: 0.5,    // 等待时间增长比例（50%）
  maxRetries: 5, // 最大重试次数
  maxRestarts: 3 // 60秒内最大重启次数
});
```

### 服务实现原理

使用 [winsw]为每个服务生成独立的 `.exe` 和 `.xml` 配置文件，存储在脚本所在目录的 `daemon` 子文件夹中；服务日志可通过 Windows 事件查看器查看；

---

# 事件日志系统

flun-windows 提供非 C++ 依赖的事件日志功能：

```js
import { EventLogger } from 'flun-windows';
const eLog1 = new EventLogger('服务名称');

eLog1.info('基本信息');
eLog1.warn('警告信息');
eLog1.error('错误信息');
eLog1.auditSuccess('审计成功');
eLog1.auditFailure('审计失败');

// 自定义事件代码
eLog1.error('特殊事件', 1002, ()=>{
  console.log('日志已写入');
});

// 使用 SYSTEM 日志
const eLog2 = new EventLogger({
  source: '自定义日志源名称', eventLog: 'SYSTEM'
});
```

---

# 系统命令工具

## elevate（权限提升）

`elevate` 类似于 Linux/Mac 上的 `sudo`，它会尝试将当前用户的权限提升为本地管理员;但要求当前用户具有管理员权限,若无管理员权限,命令将失败并返回 `access denied` 错误。

系统会弹出 UAC 提示,确认用户是否允许继续;

**语法**：`elevate(cmd[, options][, callback])`

**示例**：

```js
import { elevate } from 'flun-windows';
// 基本用法
elevate('echo "Hello World" && whoami',{}, (error, stdout, stderr) => {
    if (error) {
        console.error('执行失败:', error);
    } else {
        console.log('执行成功，输出:', stdout);
        console.log('错误输出:', stderr);
    }
});

// 带选项参数
elevate('echo "Hello World" && whoami', { cwd:'C:\\' }, callback);

// 多种参数组合
elevate('echo "Hello World" && whoami', (err, stdout)=> { }); // options视为回调
elevate('echo "Hello World" && whoami'); // 无回调
```

## sudo（管理员执行）

`sudo` 与 Linux/Mac 上的 `sudo` 类似。与 `elevate` 雷同,但稳定性更高,这仍要求用户具有管理员权限,并且需在Windows上启用sudo命令,否则命令将失败;

**语法**：`sudo(cmd[, options][, callback])`

**参数说明**：
- `cmd`：要执行的命令
- `options`（可选）：执行选项
- `callback`（可选）：执行完成后的回调函数

**示例**：

```js
import { sudo } from 'flun-windows';

// 基本用法 - 命令、选项和回调
sudo('echo "Hello World" && whoami', {}, (error, stdout, stderr) => {
    if (error) console.error('执行失败:', error);
    else {
        console.log('执行成功，输出:', stdout);
        console.log('错误输出:', stderr);
    }
});

// 带选项参数
sudo('echo "Hello World" && whoami', {cwd:'C:\\'}, callback);

sudo('echo "Hello World" && whoami' ); // 无回调
```

## 管理员权限检测

此异步命令用于判断当前用户是否拥有管理员权限;它会向回调函数传递一个布尔值,如果用户是管理员则返回 `true`，否则返回 `false`。

**语法**：`isAdminUser(callback)`

**示例**：

```js
import { isAdminUser } from 'flun-windows';
isAdminUser(isAdmin => {
  if (isAdmin) console.log('当前用户是管理员');
  else console.log('当前用户不是管理员');
});
```

## 进程列表

获取运行中的 Windows 进程/服务列表。

```js
import { list } from 'flun-windows';
list(processes => {
  console.log(processes);
}, true); // true 显示详细信息
```

## 终止进程

通过 PID 终止特定进程。

```js
import { kill } from 'flun-windows';
kill(进程PID, () => {
  console.log('进程已终止');
});
```

---

# 故障排除

## elevate 和 sudo 函数常见问题

1. **sudo 函数执行失败**：这可能是因为 `sudo.exe` 外部工具不兼容当前系统，建议使用 `elevate` 函数作为替代

2. **权限被拒绝**：确保当前用户具有管理员权限，可以运行 `isAdminUser` 函数检查

3. **回调函数未执行**：确保正确传递回调函数，如果不需要回调，可以不传但无法获取执行结果

4. **sudo 函数需要在系统中启用sudo命令**：如果是创建服务实例,还需设置 sudo.enabled为true

## 服务管理常见问题

- `invalidinstallation` 错误通常表示 daemon 目录文件不完整
- 卸载时若文件被锁定，可重新运行卸载或手动删除 `daemon` 目录

---

# 致谢！！！

感谢所有贡献者，特别感谢 @arthurblake、@hockeytim11 等开发者的贡献；

# 许可证

winsw 和 sudowin 遵循各自所有者的许可证；flun-windows 核心代码采用 ISC 许可证（具体内容请见许可证文档）
```