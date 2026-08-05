export {};
declare global {
  interface Window {
    demoShield: {
      openVideo: () => Promise<string | null>;
      saveProject: (project: unknown) => Promise<string | null>;
    };
  }
}
