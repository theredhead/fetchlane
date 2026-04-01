import { from } from './fetch-request-builder';

describe('FetchRequestBuilder', () => {
  it('builds a request with text predicates, sorting, and pagination', () => {
    const request = from('member')
      .where('name = ?', 'Alice')
      .orderBy('name', 'ASC')
      .paginate(25, 2).request;

    expect(request).toEqual({
      table: 'member',
      predicates: [{ text: 'name = ?', args: [['Alice']] }],
      sort: [{ column: 'name', direction: 'ASC' }],
      pagination: { size: 25, index: 2 },
    });
  });

  it('supports array-based where clauses and grouped predicates', () => {
    const request = from('member')
      .where([{ text: 'active = ?', args: [true] }])
      .whereAnd([{ text: 'age > ?', args: [18] }])
      .whereOr([{ text: 'city = ?', args: ['Enschede'] }]).request;

    expect(request.predicates).toEqual([
      { text: 'active = ?', args: [true] },
      { type: 'AND', predicates: [{ text: 'age > ?', args: [18] }] },
      {
        type: 'OR',
        predicates: [{ text: 'city = ?', args: ['Enschede'] }],
      },
    ]);
  });

  it('supports replacing sort clauses with an array', () => {
    const request = from('member').orderBy([
      { column: 'name', direction: 'ASC' },
      { column: 'created_at', direction: 'DESC' },
    ]).request;

    expect(request.sort).toEqual([
      { column: 'name', direction: 'ASC' },
      { column: 'created_at', direction: 'DESC' },
    ]);
  });
});
