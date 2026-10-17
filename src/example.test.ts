import 'reflect-metadata';
import { Temporal } from '@js-temporal/polyfill';
import { Collection, Type } from '@mikro-orm/core';
import { Entity, ManyToOne, OneToMany, PrimaryKey, Property, ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { MikroORM } from '@mikro-orm/sqlite';

@Entity()
class User {

  @PrimaryKey()
  id!: number;

  @Property()
  name: string;

  @Property({ unique: true })
  email: string;

  @OneToMany(() => Event, event => event.user)
  events = new Collection<Event>(this);

  constructor(name: string, email: string) {
    this.name = name;
    this.email = email;
  }

}

class ZonedDateTime extends Type<Temporal.ZonedDateTime | null, string | null> {
  override convertToJSValue(value: string | null): Temporal.ZonedDateTime | null {
    if (value === null) {
      return null;
    }
    return Temporal.ZonedDateTime.from(value);
  }
  override convertToDatabaseValue(value: Temporal.ZonedDateTime | null): string | null {
    if (value === null) {
      return null;
    }
    // if (typeof value === 'string') {
    //   throw new TypeError('ZonedDateTime was converted more than once');
    // }
    return value.toInstant().toString();
  }
}

@Entity()
class Event {

  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User)
  user!: User;

  @Property({ type: ZonedDateTime })
  startsAt!: Temporal.ZonedDateTime;

}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ':memory:',
    entities: [User, Event],
    metadataProvider: ReflectMetadataProvider,
    debug: ['query', 'query-params'],
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refresh();
});

afterAll(async () => {
  await orm.close(true);
});

test('basic CRUD example', async () => {
  orm.em.create(User, { name: 'Foo', email: 'foo' });
  await orm.em.flush();
  orm.em.clear();

  const user = await orm.em.findOneOrFail(User, { email: 'foo' });
  expect(user.name).toBe('Foo');
  user.name = 'Bar';
  orm.em.remove(user);
  await orm.em.flush();

  const count = await orm.em.count(User, { email: 'foo' });
  expect(count).toBe(0);
});

test('reproduces duplicate conversion for nested custom-type collection filters', async () => {
  const user = orm.em.create(User, { name: 'Foo', email: 'foo' });
  const startsAt = Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]');
  orm.em.create(Event, { user, startsAt });
  await orm.em.flush();
  orm.em.clear();

  const users = await orm.em.find(User, {
    events: {
      $some: { startsAt },
    },
  });

  expect(users).toHaveLength(1);
  expect(users[0].email).toBe('foo');
});
