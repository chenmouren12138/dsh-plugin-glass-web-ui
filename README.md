# Liquid Glass Particle Field · 液态玻璃粒子层

> A DeepSeek Harness Web UI plugin that lays a click-through liquid-glass atmosphere over the
> whole app and a pushable particle lattice on top of it — all parameters adjustable live in
> **Settings → 液态玻璃**.

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4d6bfe)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)
[![Tests](https://img.shields.io/badge/tests-7%20suites%20passing-brightgreen)](tests)

---

## 这是什么

一个**纯外观**插件。装上之后，整个 DeepSeek Harness Web UI 会多出一层覆盖全屏、点击穿透的玻璃氛围：

- **多色氛围光池** —— 三组渐变叠成有机色块，主色/辅助色/第三色可分别调
- **漂移光球** —— 三颗大半径模糊光球缓慢游动，周期可调
- **网格纹理** —— 48px 网格，颜色与透明度可调
- **指针追光** —— 径向高光跟随鼠标
- **粒子点阵** —— 网格交点上的点阵，指针靠近时被推开、变亮，移开后弹簧回位
- **面板半透明** —— 通过官方 `theme.overrideTokens` 把界面表面调成半透明，玻璃层透出来
- **标题栏底色跟随** —— 页面内那条 40px 标题栏使用同一套采样色

所有参数在设置页实时生效并保存在本机。插件只做渲染，不改宿主代码、不注入宿主 DOM 结构、不依赖任何第三方依赖。

## 截图

| 深色主题 | 浅色主题 |
|---|---|
| ![设置面板（深色）](docs/settings-dark.jpg) | ![设置面板（浅色）](docs/settings-light.jpg) |

同一套配色在两种主题下的实际渲染：

![深色 / 浅色适配](docs/layer-themes.jpg)

## 环境要求

- DeepSeek Harness，带 Web UI（`dsh web` 或 DSH Desktop）
- 桌面端 / 浏览器端都可以；标题栏相关功能只在桌面端生效
- 无运行时依赖，无需构建步骤

## 安装

### 方式一：插件管理器（推荐）

```
plugin_manager({ action: "install_bundle", target: "<本目录绝对路径>" })
```

安装后插件立即激活，不需要重启。验证方式：设置里出现「液态玻璃」一节。

### 方式二：手动 link

把本目录加入 profile 的依赖：

```bash
cd ~/.dsh/profiles/<profile>
pnpm add link:<repo>/glass-liquid
```

然后在 profile 的 `cordis.patch.yml` 中插入一行：

```yaml
- insert:
    - id: glass-liquid
      name: '@local/glass-liquid'
```

### 升级

```
plugin_manager({ action: "remove_bundle", target: "@local/glass-liquid" })
plugin_manager({ action: "install_bundle", target: "<本目录绝对路径>" })
```

替换包需要先移除再安装——同一个包重新安装不会刷新已加载的模块代际。

### 卸载

```
plugin_manager({ action: "remove_bundle", target: "@local/glass-liquid" })
```

token 覆盖层、样式表、图层、事件监听全部自动还原；宿主恢复到原样。

## 配置

设置 → **液态玻璃**，共 11 个控件，全部实时生效。

| 分组 | 控件 | 范围 | 默认 |
|---|---|---|---|
| 液态玻璃 | 主色 / 辅助色 / 第三色 | `#rrggbb` | `#8f7bff` / `#5fd4e6` / `#ff9fb8` |
| | 氛围强度 | 0–1 | 0.30 |
| | 网格纹理 | 0–1 | 0.10 |
| | 指针追光 | 0–1 | 0.18 |
| | 光球周期 | 8–60 s | 26 |
| 标题栏 | 同步标题栏配色 | 开/关 | 开 |
| 面板半透明 | 表面透明度 | 0–0.7 | 0（不改主题） |
| 粒子波动 | 密度 | 1–8× | 3 |
| | 点大小 | 0.6–3 px | 1.0 |
| | 不透明度 | 0.05–1 | 0.45 |
| | 拨动半径 | 60–320 px | 150 |
| | 推力 | 0–6 | 2.5 |
| | 阻尼 | 0.8–0.98 | 0.98 |
| | 响应指针 | 开/关 | 开 |

**「恢复默认」** 回到上表的值。**禁用插件** 会忘记已保存的参数，下次启用回到默认外观。

### 表面透明度

`surface` 映射为表面 token 的 alpha：

```
表面不透明度 = 1 - surface        例如 surface 0.4 → token alpha 0.6
```

覆盖 5 个 token：`--dsw-alias-bg-base`、`-bg-layer-1`、`-bg-layer-2`、`-bg-overlay`、`--dsw-specific-sidebar-fill`。
色值从活动主题的**实时计算样式**读取，只改 alpha，所以深浅主题都正确。`surface = 0` 时不安装任何覆盖层。

## 工作原理

### 只用官方扩展点

| 需求 | 使用的接口 |
|---|---|
| 改全局表面外观 | `ctx.get('theme').overrideTokens(source, tokens)` |
| 提供设置页 | `ctx.slots.inject('settings.section', () => ctx.slots.register(...))` |
| 注入样式 | `ctx.get('styles').insert(css)`，不可用时退回 `<style>` + `ctx.effect` 清理 |

`overrideTokens` 的语义：在活动主题之上叠加一层 token，基础主题不被修改，多层按序合成、后者胜出，移除该层即恢复原值。

### 粒子物理

数值取自 `glass-kit` 文档并逐项保留：

| 行为 | 实现 |
|---|---|
| 网格间距 | `GAP = 48`，点距 `48 / 密度` |
| 推力模型 | `d < radius` 时 `(1 - d/radius) * push`，硬截断 |
| 弹簧回位 | `v += (base - pos) * 0.055` |
| 阻尼 | `Math.pow(damping, dt/16.67)`，按帧间隔归一化 |
| 静止即休眠 | 连续 3 帧位移 < 0.06px 停掉 rAF |
| 亚像素吸附 | 休眠时偏移 < 0.5px 直接吸附回基准点 |
| 分档批量填充 | alpha 量化 8 档批量 `fill`；密度 ≥ 6× 时降为 4 档控制开销 |
| 3px 死区 | 位移 < 3px 不提升亮度，避免归位闪烁 |

### 深浅主题适配

同一套颜色在两套主题下用不同配方渲染，**色相不变**：

| 层 | 深色主题 | 浅色主题 | 原因 |
|---|---|---|---|
| 氛围渐变 / 光球 | 原色 | 提亮 16%，强度 ×0.75 | 浅底上压暗会显脏，提亮才是磨砂彩 |
| 网格线 | 白色 ×0.16 | 主色压暗 55% ×0.10 | 白线在白底等于不可见 |
| 指针追光 | ×1.0 | ×0.6 | 浅底高光容易过曝 |
| 粒子点 | 原色 | 压暗 42%，透明度 ×1.15，点径 ×1.05 | 细小浅色点在白底会消失 |

### 性能

- 图层是纯 CSS 渐变 + 一个 `canvas`，指针停下 3 帧后 rAF 完全停止
- 表面 token 重建合并到每帧一次，且值未变化时跳过（拖动滑杆不会反复重建）
- 高密度点阵自动降低透明度分档
- 尊重 `prefers-reduced-motion`：光球停止、粒子归位不启动

## 已知边界

### 右上角 `─ □ ✕` 无法改变颜色

这三个按钮由 Windows 原生绘制，插件改不了。两条可能路径都被宿主结构性封死，均已实测：

1. **预加载脚本的 `windowsAppearance` 通道** —— token 值与探针解析完全一致，但主进程有帧校验，不匹配的消息静默丢弃。
2. **Host 半区直接调 Electron** —— dsh 后端是独立 `node.exe` 进程，不是 Electron 主进程，结构上拿不到 `electron` 模块。

因此「同步标题栏配色」只影响**页面内那条 40px 标题栏**的底色，设置页已如实说明。

### 启动瞬间

主窗口以隐藏状态创建，插件初始化时 canvas 量到 0×0。已加入零尺寸重试（250ms），并用 `load` / `ResizeObserver` / `visibilitychange` 补触发，布局就绪后粒子会自动出现。

### 当前限制

- 只对**覆盖整页**的层做了设计，不提供单页面局部效果
- Host 半区是空实现（无 Service、无 Tool、无定时器），所有渲染都在浏览器半区
- 插件不收集任何数据，不联网

## 开发

```
glass-liquid/
├── index.js            # Host 半区：Standard Schema 配置校验，activate 后为空
├── client.js           # 浏览器半区：图层、粒子、主题 token、设置页
├── cordis.patch.yml    # bundle patch，插入插件行与首次启动默认值
├── locale/{en,zh}.json # 插件元数据文案
├── icon.svg
├── preview/            # 用线上同一份 CSS 渲染的静态对照页
├── docs/               # README 截图
└── tests/              # 7 套无浏览器测试（Node 直跑）
```

### 测试

```bash
npm test          # 或 node tests/run.mjs
```

不需要浏览器：测试用最小 DOM 桩直接加载 `client.js` 的懒 CJS 工厂，覆盖

| 套件 | 覆盖 |
|---|---|
| `acceptance.mjs` | 懒工厂 → `apply()` → 图层挂载 → 卸载还原 → Config 校验 |
| `settings-ui.mjs` | 设置页渲染、11 个滑杆、`aria-valuetext`、Toast |
| `surface-drag.mjs` | 拖动滑杆不重建 token 层（崩溃回归） |
| `particles.mjs` | 密度上限、批量填充降档、默认值 |
| `reset-on-disable.mjs` | 禁用后忘记参数、重新启用回到默认 |
| `theme-adapt.mjs` | 深/浅主题的提亮、网格反转、点压暗 |
| `startup-race.mjs` | 0×0 尺寸下的重试与 layout 触发 |

### 实现约束

1. **单一渲染路径**：图层用纯 DOM 构建，只有设置页用 React
2. **只用三个 React 表面**：`createElement` / `useState` / `useEffect`；`forwardRef`、`useLayoutEffect`、`ReactDOMClient` 不保证存在于冻结模块表
3. **`Config` 必须是 Standard Schema**：cordis 用 `Config['~standard'].validate()`
4. **绝不用 `backdrop-filter`**：图层在内容之上，`blur()` 会把整个界面糊掉
5. **强度用数值表达**：在 JS 里拼 `rgba()`，不依赖 `color-mix()`

## License

[MIT](LICENSE)
