export {};

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
  }
}
