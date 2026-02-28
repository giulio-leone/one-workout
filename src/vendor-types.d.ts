declare module '@giulio-leone/constants' {
  export interface TokenLimits {
    DEFAULT_MAX_TOKENS: number;
    MAX_OUTPUT: number;
    [key: string]: number;
  }
  export const TOKEN_LIMITS: TokenLimits;
  export const AI_REASONING_CONFIG: Record<string, unknown>;
}

declare module '@giulio-leone/lib-vercel-admin' {
  export const createEnvVar: (...args: any[]) => Promise<any>;
  export const getEnvVarByKey: (...args: any[]) => Promise<any>;
  export const updateEnvVar: (...args: any[]) => Promise<any>;
  export const envVarExists: (...args: any[]) => Promise<boolean>;
}
