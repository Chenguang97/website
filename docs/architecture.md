# 前端架构

当前前端使用浏览器原生 ES Modules，不依赖 Vue、React 或打包后才能运行的 UI 框架。页面直接加载角色入口，测试使用 esbuild 将相同入口打包到 jsdom；生产代码不依赖打包器。

## 页面入口

- `js/admin-entry.js`：管理员页入口。
- `js/coach-entry.js`：教练页入口。
- `js/student-entry.js`：学生页入口，并应用公开资料页传入的教练筛选。
- `js/student-login-entry.js`：只负责登录页的教练查询参数传递，不初始化完整应用。
- `js/public-profile.js`：公开教练资料页入口，不初始化预约应用状态。

每个 HTML 页面只加载一个 `type="module"` 入口。不得重新添加按顺序加载的经典脚本，也不得通过隐藏的其他角色 DOM 满足初始化依赖。

## 依赖方向

依赖保持以下单向层次：

1. `config.js`、`storage-adapter.js` 和纯工具/领域规则。
2. `demo-data.js` 与 `data-store.js`。
3. `state.js`，作为运行时可变状态的唯一所有者。
4. 渲染、导航和动作模块。
5. `app-init.js` 与角色入口。

`js/domain/scheduling.mjs` 只包含排课和预约规则，不访问 DOM、localStorage 或页面状态。`js/data-store.js` 负责序列化和恢复策略；`js/storage-adapter.js` 只负责浏览器存储访问；`js/demo-data.js` 只提供演示 fixtures。

## 状态和编辑草稿

共享可变状态集中在 `state.js` 导出的 `state` 对象中。集合替换、资料读取、草稿提交和持久化通过该模块的命名导出完成。其他模块不得创建平行的 profile、booking、filter 或 navigation 状态来源。

教练资料表单编辑独立 draft。只有保存动作可以把 draft 提交到已保存 profile；放弃编辑会清除 draft，不修改已保存数据。

## UI 和安全渲染

- 公共视觉 token、控件和组件规则维护在 `css/design-system.css`。
- 页面 CSS 只维护该页面或工作流独有布局。
- 品牌图形使用 `assets/brand-mark.svg`。
- 外部或可编辑文本优先通过 `textContent`/DOM API 渲染；必须使用模板字符串时，使用 `js/ui/safe-html.mjs`。
- 共享显示文案转换放在 `js/ui/display.js`，不要在动作和渲染模块重复映射。

## 测试边界

`tests/domain-rules.mjs` 保护纯业务规则和 HTML 转义。`tests/smoke.js` 通过真实角色入口验证页面初始化、预约、排课、资料草稿、持久化和关键 DOM 行为。测试注入的全局桥仅存在于 jsdom 构建入口，不属于生产运行时 API。

当前模块图不得存在循环依赖。结构变更后应运行入口打包、循环检测、`npm test`、JavaScript 语法检查和 `git diff --check`。
