# 前端架构

前端使用浏览器原生 ES Modules，不依赖 UI 框架或生产打包器。HTML 页面只加载一个入口；测试使用 esbuild 将相同入口打包到 jsdom。

## 入口与功能目录

- `js/admin-entry.js` → `js/admin/app.js`
- `js/coach-entry.js` → `js/coach/app.js`
- `js/student-entry.js` → `js/student/app.js`
- `js/student-login-entry.js`：只处理登录页查询参数。
- `js/public-profile.js`：公开资料页，不初始化预约应用。

业务实现按实际功能归组：

- `js/coach/profile/`：资料动作、渲染、图片处理、保存状态和资料撤销。
- `js/coach/bookings/`：预约筛选、日期选择、不可预约时间、预约列表和预约日历。
- `js/coach/availability/`：开放时间表单、拖选、冲突、保存、渲染和开放时间撤销。
- `js/student/`：学生筛选、预约动作、页面渲染、导航和学生预约撤销。
- `js/admin/`：管理员初始化、动作和渲染。
- `js/core/`：配置、fixtures、状态、存储、序列化、运行时规则适配及通用撤销历史。
- `js/domain/`：不依赖 DOM、存储或可变应用状态的纯业务规则。
- `js/ui/`：安全 HTML、显示转换、表单反馈、预约详情展示和纯日历网格。
- `js/dom/`：按角色或真实共享弹层划分的 DOM 引用。

不得恢复根级通用 `render.js`、`elements.js`、`actions.js`、`navigation.js`、`app-init.js` 或 `undo.js`。

## 依赖方向

依赖保持单向：

1. `domain` 与无状态 `ui` 工具。
2. `core` 配置、fixtures、存储与状态。
3. 角色功能模块及其局部 DOM。
4. 角色页面调度与入口。

`js/domain/scheduling.mjs` 保存纯排课规则；需要绑定当前 slots 和 blocked exceptions 时，通过 `js/core/scheduling-rules.js` 的薄适配函数完成。存储访问只在 `js/core/storage-adapter.js`，序列化和恢复只在 `js/core/data-store.js`。

公共周历网格由 `js/ui/calendar-grid.js` 根据参数构建，不读取应用状态。教练两个日历共用的预约覆盖层位于 `js/coach/calendar-bookings.js`，开放时间和预约管理分别负责自己的单元格状态及交互。

## 状态与撤销

持久业务数据由 `js/core/state.js` 持有。资料 draft 与已保存 profile 分离；只有保存动作可以提交 draft。

教练预约学生筛选的已应用值由 `js/coach/bookings/filter-state.js` 唯一持有；搜索、打开状态和未应用草稿由 `js/coach/bookings/student-picker.js` 持有。渲染只读取筛选状态。

撤销历史的栈操作位于 `js/core/undo-history.js`，但恢复与重绘归属各功能：

- `js/coach/profile/undo.js` 只恢复资料 draft，并只重绘资料。
- `js/coach/availability/undo.js` 只恢复开放时间状态及其相关视图。
- `js/coach/bookings/undo.js` 恢复教练端预约更改，并刷新预约列表和两个相关日历。
- `js/student/undo.js` 恢复学生预约并只重绘学生视图。

## UI 与安全渲染

- 共享视觉规则维护在 `css/design-system.css`，页面布局留在对应页面 CSS。
- 外部或可编辑文本优先使用 `textContent`/DOM API；模板字符串使用 `js/ui/safe-html.mjs`。
- DOM 引用必须来自对应 `js/dom/*-elements.js`；不得新增跨角色 DOM 聚合。
- 渲染不保存数据，存储模块不操作 DOM。

## 验证

`tests/domain-rules.mjs` 保护纯规则；`tests/module-architecture.mjs` 检查路径、无循环依赖、角色 DOM 边界、局部状态所有权以及旧通用模块不被恢复。`tests/smoke.js` 通过真实入口覆盖不可预约时间、学生筛选应用/取消、日期跳转、Tab 隔离、两个日历的滚动衔接、资料草稿、预约和持久化。

结构变更后运行入口打包、循环检测、`npm test`、所有 JavaScript 语法检查和 `git diff --check`。
