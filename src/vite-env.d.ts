/// <reference types="vite/client" />

// tsconfig 未开启 resolveJsonModule；Vite 原生支持 JSON 导入，
// 用通配声明提供类型（About 区引用 package.json version，阶段8）
declare module '*.json' {
    const value: { version: string } & Record<string, unknown>;
    export default value;
}

declare const utools: {
    onPluginEnter: (callback: (action: { code: string; type: string; payload: any }) => void) => void;
    onPluginOut: (callback: (isKill: boolean) => void) => void;
    onPluginDetach: (callback: () => void) => void;
    onDbPull: (callback: (docs: any[]) => void) => void;
    setSubInput: (onChange: (details: { text: string }) => void, placeholder?: string, isFocus?: boolean) => boolean;
    setSubInputValue: (text: string) => boolean;
    removeSubInput: () => boolean;
    subInputBlur?: () => boolean;
    setExpendHeight: (height: number) => boolean;
    hideMainWindow: (isRestorePreWindow?: boolean) => boolean;
    showMainWindow: () => boolean;
    outPlugin: (isKill?: boolean) => boolean;
    shellOpenExternal: (url: string) => void;
    showNotification: (body: string, clickFeatureCode?: string) => void;
    copyText: (text: string) => boolean;
    isDarkColors: () => boolean;
    getWindowType: () => 'main' | 'detach' | 'browser';
    showOpenDialog: (options: any) => string[] | undefined;
    showSaveDialog: (options: any) => string | undefined;
    redirect: (label: string | [string, string], payload?: any) => boolean;
    dbStorage: {
        setItem: (key: string, value: any) => void;
        getItem: (key: string) => any;
        removeItem: (key: string) => void;
    };
    dbCryptoStorage: {
        setItem: (key: string, value: any) => void;
        getItem: (key: string) => any;
        removeItem: (key: string) => void;
    };
    ai: (option: { model?: string; messages: any[]; tools?: any[] }, streamCallback?: (chunk: any) => void) => Promise<any> & { abort: () => void };
    allAiModels: () => Promise<any[]>;
};
