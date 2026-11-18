import{c,r as o,N as b,j as r}from"./index-CAFFA_9h.js";/**
 * @license lucide-react v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],g=c("Pen",P);/**
 * @license lucide-react v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],T=c("Plus",f),j=o.memo(({tag:s,onClick:e,onRemove:a,removeButtonRef:t,removeButtonStyle:n,removeButtonTabIndex:d,onRemoveFocus:p,size:i="sm",showRemove:u=!1})=>{const x=i==="sm"?"text-xs px-2 py-0.5":"text-sm px-3 py-1",h=o.useMemo(()=>({backgroundColor:s.color?`${s.color}20`:"var(--color-surface-hover)",color:b(s.color),border:`1px solid ${s.color||"var(--color-border)"}`}),[s.color]),m=o.useCallback(l=>{l.stopPropagation(),e==null||e()},[e]),y=o.useCallback(l=>{l.stopPropagation(),a==null||a()},[a]);return r.jsxs("span",{className:`tag ${x} inline-flex items-center gap-1 rounded-full cursor-pointer transition-colors`,style:h,onClick:m,children:[s.icon&&r.jsx("span",{children:s.icon}),r.jsx("span",{children:s.name}),u&&a&&r.jsx("button",{ref:t,type:"button",className:"tag-remove",style:n,tabIndex:d,onFocus:p,onClick:y,"aria-label":`× ${s.name}`,children:"×"})]})});j.displayName="TagBadge";export{g as P,j as T,T as a};
