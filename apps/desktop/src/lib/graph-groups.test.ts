import { describe, expect, it } from 'vitest';
import {
  AUTO_GRAPH_GROUP_COLORS,
  buildAutoGraphGroupsFromFolders,
  graphGroupQueryMatchesNode,
  parseGraphGroupQuery,
} from './graph-groups';

describe('graph group query parser', () => {
  it('parses plain, typed, path, folder, quoted, and OR tokens', () => {
    expect(parseGraphGroupQuery('alpha type:person path:"Team Notes" OR folder:Projects')).toEqual({
      clauses: [
        [
          { kind: 'plain', value: 'alpha' },
          { kind: 'type', value: 'person' },
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
});

describe('automatic graph groups', () => {
  it('builds at most six persistent path queries from top-level folders', () => {
    const groups = buildAutoGraphGroupsFromFolders([
      'Projects',
      'Projects/Archive',
      'People',
      'Areas',
      'Resources',
      'Archive',
      'Daily Notes',
      'Extras',
      'Loose.md',
    ]);

    expect(groups).toEqual([
      {
        id: 'auto-folder-projects',
        name: 'Projects',
        query: 'path:"Projects"',
        color: AUTO_GRAPH_GROUP_COLORS[0],
        enabled: true,
      },
      {
        id: 'auto-folder-people',
        name: 'People',
        query: 'path:"People"',
        color: AUTO_GRAPH_GROUP_COLORS[1],
        enabled: true,
      },
      {
        id: 'auto-folder-areas',
        name: 'Areas',
        query: 'path:"Areas"',
        color: AUTO_GRAPH_GROUP_COLORS[2],
        enabled: true,
      },
      {
        id: 'auto-folder-resources',
        name: 'Resources',
        query: 'path:"Resources"',
        color: AUTO_GRAPH_GROUP_COLORS[3],
        enabled: true,
      },
      {
        id: 'auto-folder-archive',
        name: 'Archive',
        query: 'path:"Archive"',
        color: AUTO_GRAPH_GROUP_COLORS[4],
        enabled: true,
      },
      {
        id: 'auto-folder-daily-notes',
        name: 'Daily Notes',
        query: 'path:"Daily Notes"',
        color: AUTO_GRAPH_GROUP_COLORS[5],
        enabled: true,
      },
    ]);
    expect(groups.map((group) => group.color)).not.toContain('#14b8a6');
  });

  it('quotes generated folder queries so folders with punctuation remain parseable', () => {
    const [group] = buildAutoGraphGroupsFromFolders(['Team "A"/Notes']);

    expect(group).toMatchObject({
      id: 'auto-folder-team-a',
      name: 'Team "A"',
      query: 'path:"Team \\"A\\""',
    });
    expect(
      graphGroupQueryMatchesNode(
        { path: 'Team "A"/Notes.md', title: 'Notes', type: null },
        group?.query ?? '',
      ),
    ).toBe(true);
  });
});
