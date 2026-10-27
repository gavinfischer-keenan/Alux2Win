/// <reference types="vite/client" />
// Type declarations for non-TS assets imported by Vite
declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.json' {
  const value: any;
  export default value;
}

declare const __APP_VERSION__: string;
