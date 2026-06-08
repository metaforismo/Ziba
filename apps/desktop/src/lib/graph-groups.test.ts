import { describe, expect, it } from 'vitest';
import { graphGroupQueryMatchesNode, parseGraphGroupQuery } from './graph-groups';

describe('graph group query parser', () => {
  it('parses plain, typed, file, path, folder, quoted, and OR tokens', () => {
    expect(
      parseGraphGroupQuery(
        'alpha type:person file:"Daily Note" path:"Team Notes" OR folder:Projects',
      ),
    ).toEqual({
      clauses: [
        [
          { kind: 'plain', value: 'alpha' },
          { kind: 'type', value: 'person' },
          { kind: 'file', value: 'Daily Note' },
          { kind: 'path', value: 'Team Notes' },
        ],
        [{ kind: 'folder', value: 'Projects' }],
      ],
    });
  });

  it('matches nodes against AND clauses with OR alternatives', () => {
    const personNode = {
      path: 'Team Notes/Alpha.md',
      title: 'Alpha',
      type: 'person',
    };
    const projectNode = {
      path: 'Projects/Roadmap.md',
      title: 'Roadmap',
      type: 'project',
    };
    const otherNode = {
      path: 'Archive/Alpha.md',
      title: 'Alpha',
      type: null,
    };

    const query = 'alpha type:person path:"Team Notes" OR folder:Projects';

    expect(graphGroupQueryMatchesNode(personNode, query)).toBe(true);
    expect(graphGroupQueryMatchesNode(projectNode, query)).toBe(true);
    expect(graphGroupQueryMatchesNode(otherNode, query)).toBe(false);
  });

  it('matches file queries against the note title and markdown filename', () => {
    expect(
      graphGroupQueryMatchesNode(
        { path: 'Daily/2026-05-31.md', title: 'Daily log', type: null },
        'file:"2026-05-31"',
      ),
    ).toBe(true);
    expect(
      graphGroupQueryMatchesNode(
        { path: 'People/Carla.md', title: 'Carla', type: 'person' },
        'file:car',
      ),
    ).toBe(true);
    expect(
      graphGroupQueryMatchesNode(
        { path: 'Projects/Roadmap.md', title: 'Roadmap', type: 'project' },
        'file:car',
      ),
    ).toBe(false);
    expect(
      graphGroupQueryMatchesNode(
        { path: 'Projects/Roadmap.md', title: 'Roadmap', type: 'project' },
        'file:projects',
      ),
    ).toBe(false);
  });
});
