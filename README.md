# typeorm-bun-sqlite

Use TypeORM with SQLite on [Bun](https://bun.sh), with no native addon.

TypeORM's `better-sqlite3` driver needs a native module that Bun cannot load. This package is a small
`better-sqlite3` look-alike on top of Bun's built-in `bun:sqlite`, which you hand to that driver.

```ts
import { DataSource } from "typeorm";
import { BunSqlite } from "typeorm-bun-sqlite";

export const dataSource = new DataSource({
  type: "better-sqlite3",
  driver: BunSqlite,
  database: "/data/app.sqlite", // see "Use an absolute path"
  synchronize: true,
  entities: [/* ... */],
});
```

```
bun add typeorm typeorm-bun-sqlite
```

## What it does

- Binds booleans as `0`/`1` and `undefined` as `NULL`, which `bun:sqlite` refuses to do itself.
- Returns blobs as `Buffer` (Bun returns `Uint8Array`).
- Applies the `timeout` option as `busy_timeout` (default 5000 ms). `bun:sqlite` has none, so a locked database would fail instantly.
- Supports the `readonly` and `fileMustExist` options, `pragma()` (including `{ simple: true }`), `exec()` and `loadExtension()`.
- Finalizes all prepared statements on `close()`, so the database file is released (on Windows it otherwise stays locked).

## Use an absolute path

TypeORM creates the database's directory before opening it, and on Bun `mkdir(".")` throws `EEXIST`. A bare file
name like `app.sqlite` therefore fails. Use `path.resolve("app.sqlite")` or `:memory:`.

## Not supported

`key` (SQLCipher), `nativeBinding` and `verbose` are accepted and ignored. Bun only.

## Development

```
bun install
bun test
```

## License

MIT
