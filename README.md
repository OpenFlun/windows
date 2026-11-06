# @flun/windows

## 简介

本工具库能将您的 Node.js 应用程序作为 Windows 后台服务来运行和管理,支持服务的安装、启动、停止及卸载全流程;
还提供事件日志等功能,它主要用于面向生产环境应用程序的部署与运维;如需联系,邮箱: [open@flun.top](mailto:open@flun.top)

**本包基于 ESM 模块系统编写;**

- **推荐方式**:使用 `import` / `export` 语法,静态分析更友好,工具链兼容性最佳;
- **兼容方式**:Node.js ≥ 23.5.0 原生支持 `require(esm)`;22.12+ 需开启 `--experimental-require-module` 标志;
- **重要**:本文档所有示例均采用 **ESM 标准**,请确保你的项目 `package.json` 中已设置 `"type": "module"`,或将脚本后缀改为
  `.mjs`;

## 特性

@flun/windows 提供以下功能:

- **服务管理**:将 Node.js 脚本作为原生 Windows 服务运行(含监控功能)
- **事件日志**:写入 Windows 事件日志
- **系统命令**:
  - _权限提升_:以管理员权限运行命令(会触发 UAC 确认)
  - _Sudo 执行_:以管理员身份执行命令
  - _权限检测_:检测当前用户是否具有管理员权限
  - _进程列表_:列出运行中的 Windows 进程/服务
  - _终止进程_:通过 PID 终止特定进程

---

## 包目录结构

随包发布的文件:

```
@flun/windows/
├── bin/winsw/            winsw 可执行文件(内部资源,非命令)
├── bin/cli.js            命令行入口
├── bin/elevate.vbs       UAC 提权脚本(内部资源,非命令)
├── lib/binaries.js       外部二进制定位与提权调用
├── lib/cmd.js            进程列表与终止
├── lib/daemon.js         Windows 服务管理类
├── lib/eventlog.js       事件日志写入
├── lib/winsw.js          winsw 配置生成
├── lib/wrapper.js        进程包装器
├── lib/shared.js         共享工具函数
├── README.md             本文件
├── CHANGELOG.md          更新日志
├── copy-files.js         postinstall 复制二进制资源
├── index.js              库入口,导出 elevate / sudo / isAdminUser / kill / list / Service / EventLogger
├── win-service.config.js 服务配置模板(全量字段,必填项带 *)
├── index.d.ts            类型声明
├── LICENSE               许可
└── package.json          包配置
```

## 安装前准备

### 允许安装脚本执行

本包在安装时可能触发某些依赖包的自动脚本(如 `postinstall` 等);如果你的 npm 全局配置或项目配置禁止了脚本执行(例如设置了
`ignore-scripts=true`),可能会导致安装不完整或运行时异常;

推荐在项目根目录的 `package.json` 中添加 `allowScripts` 字段,显式放行本包及其依赖的脚本:

```json
{
  "allowScripts": {
    "@flun/windows": true
  }
}
```

---

## 安装

全局安装后可直接使用 `windows` 命令:

```bash
npm i -g @flun/windows
```

局部安装时用 `npx windows` 调用,或在 `package.json` 的 `scripts` 中直接写 `windows`:

```bash
npm i @flun/windows
```

### 无原生模块依赖

Windows 上的原生 Node 模块安装复杂,通常需要 Visual Studio 和 node-gyp 进行编译;@flun/windows **不依赖任何原生模块**,
所有二进制工具均已预打包,无需安装 Visual Studio 等编译环境;

---

## 命令行

命令在 `npm scripts` 中运行时,工作目录取 `INIT_CWD`,即发起 npm 命令的项目根目录;

```bash
windows <命令> [--键 值]
```

服务类命令默认读取你项目根目录的配置文件(`win-service.config.js`) ;如果命令行指令后加了 `--键 值` ,那么以命令配置为准;

### 快速开始
编辑`win-service.config.js`文件,填写带 `*` 的必填项 `name` 与 `script`;

```bash
windows install # 按配置文件安装并启动服务

windows install --name MyApp --script D:\app\main.js # 带参安装并启动
```

安装后默认启动服务;若只需安装,加 `--no-start`;

全局安装不触发 `postinstall`,可用 `windows example` 手动生成模板;

### 命令

#### 服务类

| 命令               | 说明                                          |
| ------------------ | --------------------------------------------- |
| `install`          | 安装服务,装完默认启动;`--no-start` 只装不启动 |
| `uninstall`        | 卸载服务                                      |
| `start`            | 启动服务                                      |
| `stop`             | 停止服务                                      |
| `restart`          | 重启服务                                      |
| `status`           | 查询状态,输出 0-3                             |
| `xml`              | 输出 winsw 配置 XML                           |
| `exe [--dir 目录]` | 生成 winsw 可执行文件                         |

#### 其它

| 命令                   | 说明                                        |
| ---------------------- | ------------------------------------------- |
| `list [--verbose]`     | 列出运行中的进程                            |
| `kill <pid> [--force]` | 结束进程                                    |
| `log <级别> <消息>`    | 写事件日志                                  |
| `is-admin`             | 检查当前是否管理员                          |
| `elevate <命令...>`    | 以管理员权限执行命令                        |
| `example`              | 生成 `win-service.config.js` 模板到当前项目 |
| `help`                 | 显示帮助                                    |

`status` 输出状态码:`0` 不存在;`1` 有服务无文件;`2` 有文件无服务;`3` 完整存在;

`log` 的级别取 `info`、`warn`、`error`、`success`、`failure`;`success` 与 `failure`
分别对应 `auditSuccess` 与 `auditFailure`;可加 `--source <名>` 指定事件源,`--id <号>` 指定事件 ID;

### 命令行参数示例

```bash
# 前提:win-service.config.js 已提供 name 与 script;以下每条只覆盖部分字段

# 1. 覆盖描述:装出的服务在服务管理器中显示为该描述
windows install --description "我的服务"

# 2. 覆盖 node 启动参数:服务以 --harmony 模式运行
windows install --nodeOptions '["--harmony"]'

# 3. 打开出错退出:脚本运行出错时进程直接退出(省略值即 true)
windows install --abortOnError
```

字符串值用双引号,JSON 值用单引号(避免 shell 解析方括号);值先按 JSON 解析,失败则按字符串处理;

---

## 函数方式

### 快速开始
配置(`win-service.config.js`)必填项,详见[参考配置](#参考配置);

```js
// 创建并安装一个 Windows 服务:
import { Service } from '@flun/windows';
import config from './win-service.config.js';

const svc = new Service(config);

// 安装并自动启动服务(默认)
svc.install();
```

安装后可用 Windows 服务管理器、`NET START/STOP` 或 `sc` 命令管理;

### 配置功能

| 功能          | 类型 | 说明                                  |
| ------------- | ---- | ------------------------------------- |
| `Service`     | 类   | Windows 服务管理,安装/卸载/启停       |
| `EventLogger` | 类   | 写入 Windows 事件日志                 |
| `elevate`     | 函数 | 以管理员权限运行命令(触发 UAC)        |
| `sudo`        | 函数 | 以管理员身份执行命令(需系统启用 sudo) |
| `isAdminUser` | 函数 | 检测当前用户是否具有管理员权限        |
| `list`        | 函数 | 列出运行中的进程/服务                 |
| `kill`        | 函数 | 通过 PID 终止进程                     |

以下各节为各导出的详细用法;

### Windows 服务管理

@flun/windows 可将 Node.js 脚本转换为 Windows 服务;注意:创建服务需要管理员权限!!

以下示例仅列常用项,全部可配置字段与默认值见[参考配置](#参考配置);

基础示例:

```js
import { Service } from '@flun/windows';
import config from './win-service.config.js';

const svc = new Service(config);

// 安装并自动启动服务(默认)
svc.install();

// 只安装,不自动启动
// svc.install(undefined, false);
```

服务创建后可通过 Windows 服务管理器、`NET START/STOP` 或 `sc` 命令管理;

默认情况下,各方法执行后会在终端打印结果(如 `服务安装完成;`);
若将本包嵌入到生产项目,终端输出会混入宿主日志,可在配置中设 `quiet: true`,
此时库只发事件、不打印,通过下方事件获取状态;命令行方式恒为 `quiet`,不受此字段影响;

#### 支持的事件

- _install_ - 服务安装完成
- _alreadyinstalled_ - 服务已存在
- _invalidinstallation_ - 安装文件不完整
- _uninstall_ - 卸载完成
- _alreadyuninstalled_ - 服务未安装
- _start_ - 服务启动
- _stop_ - 服务停止
- _error_ - 发生错误

#### 环境变量设置

`@flun/windows` 会自动向服务进程注入 `USERPROFILE` 环境变量,其值为**安装服务时当前登录用户的主目录**(例如
`C:\Users\你的用户名`;
这确保了服务中调用 `os.homedir()` 能返回正确的用户目录,即使服务以 `LocalSystem` 等系统账户运;

**你通常不需要手动设置 `USERPROFILE`**,如需添加其他自定义环境变量,可按以下方式:

```js
// win-service.config.js
export default {
  // ...其余字段
  env: {
    MY_CUSTOM_VAR: 'some value',
    ANOTHER_VAR: 'hello',
  },
};
```

也支持数组形式,元素为 `{ name, value }`:

```js
// win-service.config.js
export default {
  // ...其余字段
  env: [
    { name: 'VAR1', value: 'value1' },
    { name: 'VAR2', value: 'value2' },
  ],
};
```

#### 用户账户配置

```js
import { Service } from '@flun/windows';
import config from './win-service.config.js';

const svc = new Service(config);

// 安装后指定特定用户或凭据以登录运行
svc.logOnAs.domain = 'mydomain.local';
svc.logOnAs.account = 'username';
svc.logOnAs.password = 'password';
svc.logOnAs.mungeCredentialsAfterInstall = true; // 默认
```
> **提示**:即使你使用默认的 `LocalSystem` 账户运行服务,`@flun/windows` 也会通过自动注入 `USERPROFILE` 环境变量,
  使你的应用能够正确获取当前登录用户的目录(例如读取用户目录下的配置文件);因此,你不需要为了修正 `os.homedir()` 而特意配置
  `logOnAs` 账户和密码;

#### 服务卸载

```js
import { Service } from '@flun/windows';
import config from './win-service.config.js';

const svc = new Service(config);
svc.on('uninstall', ()=>{
  console.log('卸载完成');
  console.log('服务是否存在:', svc.exists);
  // svc.exists 返回值说明:
  // 0: 服务和相关文件没有
  // 1: 服务已注册但相关文件不存在(异常情况)
  // 2: 服务未注册但相关文件存在(文件残留)
  // 3: 服务已注册且相关文件存在(正常状态)
});

svc.uninstall();
```

注:卸载仅移除服务相关文件,**不会删除您的 Node.js 脚本**;

#### 服务实现原理

使用 [winsw]为每个服务生成独立的 `.exe` 和 `.xml` 配置文件,存储在脚本所在目录的 `daemon` 子文件夹中;服务日志可通过 Windows
事件查看器查看;
此外,服务启动时会自动设置 `USERPROFILE` 环境变量为安装服务时当前用户的用户目录,保证路径相关 API 的行为与预期一致;

### 事件日志系统

@flun/windows 提供非 C++ 依赖的事件日志功能:

```js
import { EventLogger } from '@flun/windows';
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

### 系统命令工具

#### elevate(权限提升)

`elevate` 类似于 Linux/Mac 上的 `sudo`,它会尝试将当前用户的权限提升为本地管理员;但要求当前用户具有管理员权限,
若无管理员权限,命令将失败并返回 `access denied` 错误;

系统会弹出 UAC 提示,确认用户是否允许继续;

**语法**:`elevate(cmd[, options][, callback])`

**示例**:

```js
import { elevate } from '@flun/windows';
// 基本用法
elevate('echo "Hello World" && whoami',{}, (error, stdout, stderr) => {
    if (error) console.error('执行失败:', error);
    else console.log('执行成功,输出:', stdout), console.log('错误输出:', stderr);
});

// 带选项参数
elevate('echo "Hello World" && whoami', { cwd:'C:\\' }, callback);

// 多种参数组合
elevate('echo "Hello World" && whoami', (err, stdout)=> { }); // options视为回调
elevate('echo "Hello World" && whoami'); // 无回调
```

#### sudo(管理员执行)

`sudo` 与 Linux/Mac 上的 `sudo` 类似;与 `elevate` 雷同,但稳定性更高,这仍要求用户具有管理员权限,
并且需在Windows上启用sudo命令,否则命令将失败;

**语法**:`sudo(cmd[, options][, callback])`

**参数说明**:
- `cmd`:要执行的命令
- `options`(可选):执行选项
- `callback`(可选):执行完成后的回调函数

**示例**:

```js
import { sudo } from '@flun/windows';

// 基本用法 - 命令、选项和回调
sudo('echo "Hello World" && whoami', {}, (error, stdout, stderr) => {
    if (error) console.error('执行失败:', error);
    else console.log('执行成功,输出:', stdout), console.log('错误输出:', stderr);
});

// 带选项参数
sudo('echo "Hello World" && whoami', {cwd:'C:\\'}, callback);

sudo('echo "Hello World" && whoami' ); // 无回调
```

#### 管理员权限检测

此异步命令用于判断当前用户是否拥有管理员权限;它会向回调函数传递一个布尔值,如果用户是管理员则返回 `true`,否则返回 `false`;

**语法**:`isAdminUser(callback)`

**示例**:

```js
import { isAdminUser } from '@flun/windows';
isAdminUser(isAdmin => {
  if (isAdmin) console.log('当前用户是管理员');
  else console.log('当前用户不是管理员');
});
```

#### 进程列表

获取运行中的 Windows 进程/服务列表;

```js
import { list } from '@flun/windows';
list(processes => {
  console.log(processes);
}, true); // true 显示详细信息
```

#### 终止进程

通过进程 PID 终止特定进程;

```js
import { kill } from '@flun/windows';
kill(PID, () => {
  console.log('进程已终止');
});
```

---

## 参考配置

以下为 `win-service.config.js` 的字段说明,属查阅性内容,使用前无需通读;
带 * 的字段为必填项;

| 参数                | 作用                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `name` *            | 服务名称,同时作为注册表与服务标识;不能含 `<>:"\/` 与 `?*` 及竖线                 |
| `script` *          | 启动服务的入口脚本绝对路径                                                       |
| `description`       | 服务描述,显示在服务管理器中;默认空字符串                                         |
| `nodeOptions`       | 传递给 node 进程的选项;默认 `--harmony`                                          |
| `scriptOptions`     | 传递给脚本的选项;默认空字符串                                                    |
| `execPath`          | node 可执行文件路径;默认取当前进程 `execPath`                                    |
| `workingDirectory`  | 服务工作目录;默认取当前工作目录                                                  |
| `maxRetries`        | 无响应或故障前的最大重试次数;默认 `null`,不启用                                  |
| `maxRestarts`       | 60 秒内最大重启次数;默认 `3`,`0` 表示不启用                                      |
| `stoptimeout`       | 停止服务的超时秒数;默认 `30`                                                     |
| `wait`              | 脚本停止后等待重启的秒数;默认 `1`                                                |
| `grow`              | 重启等待时间的增长百分比;默认 `0.25`                                             |
| `abortOnError`      | 脚本运行错误时是否退出进程;默认 `false`                                          |
| `stopparentfirst`   | 是否先停止父进程;默认 `false`                                                    |
| `logpath`           | 日志文件路径;默认与可执行文件同目录                                              |
| `logmode`           | 日志模式,取 `rotate`、`truncate`、`append`;默认 `rotate`                         |
| `env`               | 环境变量,形如 `{ name, value }` 或同构数组                                       |
| `logging`           | 日志配置对象,可替代 `logmode`;含 `mode`、`pattern`、`sizeThreshold`、`keepFiles` |
| `logOnAs`           | 服务登录凭据,含 `account`、`password`、`domain`、`mungeCredentialsAfterInstall`  |
| `allowServiceLogon` | 是否允许服务登录                                                                 |
| `quiet`             | 为 `true` 时不打印执行结果,只发事件;默认 `false`;命令行方式恒为 `true`           |

---

## 常见问题

### elevate 和 sudo 函数常见问题

1. **sudo 函数执行失败**:这可能是因为 `sudo.exe` 外部工具不兼容当前系统,建议使用 `elevate` 函数作为替代

2. **权限被拒绝**:确保当前用户具有管理员权限,可以运行 `isAdminUser` 函数检查

3. **回调函数未执行**:确保正确传递回调函数,如果不需要回调,可以不传但无法获取执行结果

4. **sudo 函数需要在系统中设置并启用sudo**

### 服务管理常见问题

- `invalidinstallation` 错误通常表示 daemon 目录文件不完整
- 卸载时若文件被锁定,可重新运行卸载或手动删除 `daemon` 目录

---

## 许可证

winsw 和 sudowin 遵循各自所有者的许可证;@flun/windows 核心代码采用 ISC 许可证(具体内容请见许可证文档)

---

## 贡献

感谢所有贡献者,特别感谢 @arthurblake、@hockeytim11 等开发者的贡献;