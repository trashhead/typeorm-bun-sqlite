import "reflect-metadata";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Column, DataSource, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { BunSqlite } from "../src";

@Entity()
class Owner {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column("varchar")
  name!: string;
}

@Entity()
class Thing {
  @PrimaryGeneratedColumn()
  id!: number;
  @Column("boolean")
  active!: boolean;
  @Column({ type: "datetime" })
  created!: Date;
  @Column({ type: "blob" })
  data!: Buffer;
  @Column({ type: "float", nullable: true })
  size?: number | null;
  @ManyToOne(() => Owner, { onDelete: "CASCADE" })
  owner!: Owner;
}

const dir = mkdtempSync(join(tmpdir(), "typeorm-bun-sqlite-"));
const ds = new DataSource({
  type: "better-sqlite3",
  driver: BunSqlite,
  database: join(dir, "test.sqlite"),
  synchronize: true,
  entities: [Owner, Thing],
});

beforeAll(() => ds.initialize());
afterAll(async () => {
  await ds.destroy();
  rmSync(dir, { recursive: true, force: true });
});

test("saves and reads booleans, dates, blobs and nulls", async () => {
  const owner = await ds.getRepository(Owner).save({ name: "a" });
  const repo = ds.getRepository(Thing);
  const created = new Date("2025-01-02T03:04:05.000Z");
  await repo.save({ active: true, created, data: Buffer.from([1, 2, 3]), size: undefined, owner });
  const [thing] = await repo.find();
  expect(thing.active).toBe(true);
  expect(thing.created.toISOString()).toBe(created.toISOString());
  expect(Buffer.isBuffer(thing.data)).toBe(true);
  expect([...thing.data]).toEqual([1, 2, 3]);
  expect(thing.size).toBeNull();
});

test("transactions roll back", async () => {
  const repo = ds.getRepository(Owner);
  const before = await repo.count();
  await expect(
    ds.transaction(async (m) => {
      await m.save(Owner, { name: "tx" });
      throw new Error("fail");
    })
  ).rejects.toThrow("fail");
  expect(await repo.count()).toBe(before);
});

test("foreign keys are enforced and cascade", async () => {
  const owner = await ds.getRepository(Owner).save({ name: "cascade" });
  await ds.getRepository(Thing).save({ active: false, created: new Date(), data: Buffer.alloc(0), owner });
  await ds.getRepository(Owner).delete(owner.id);
  expect(await ds.getRepository(Thing).countBy({ owner: { id: owner.id } })).toBe(0);
});

test("fileMustExist throws for a missing file", () => {
  expect(() => new BunSqlite(join(dir, "missing.sqlite"), { fileMustExist: true })).toThrow();
});
