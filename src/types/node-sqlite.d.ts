declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { run: (...args: any[]) => any; get: (...args: any[]) => any; all: (...args: any[]) => any[] };
  }
}
