import {
  createDatabaseEngineRegistry,
  DatabaseEngine,
} from './database-engine';

describe('createDatabaseEngineRegistry', () => {
  it('registers each engine under all of its aliases', () => {
    const postgresEngine = {
      name: 'postgres',
      engines: ['postgres', 'postgresql'],
    } as DatabaseEngine;
    const mysqlEngine = {
      name: 'mysql',
      engines: ['mysql'],
    } as DatabaseEngine;

    const registry = createDatabaseEngineRegistry([
      postgresEngine,
      mysqlEngine,
    ]);

    expect(registry.get('postgres')).toBe(postgresEngine);
    expect(registry.get('postgresql')).toBe(postgresEngine);
    expect(registry.get('mysql')).toBe(mysqlEngine);
  });

  it('lets later engines override earlier aliases', () => {
    const first = {
      name: 'first',
      engines: ['shared'],
    } as DatabaseEngine;
    const second = {
      name: 'second',
      engines: ['shared'],
    } as DatabaseEngine;

    const registry = createDatabaseEngineRegistry([first, second]);

    expect(registry.get('shared')).toBe(second);
  });
});
