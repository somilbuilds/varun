/// <reference types="vite/client" />

declare module "*.geojson?raw" {
  const src: string;
  export default src;
}
