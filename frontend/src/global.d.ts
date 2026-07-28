declare module "*.css";
declare module "*.png" {
  const assetUrl: string;
  export default assetUrl;
}
declare module "*.mjs" {
  const assetUrl: string;
  export default assetUrl;
}
