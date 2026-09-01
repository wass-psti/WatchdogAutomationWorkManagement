import assert from 'node:assert/strict';
import { assertBoardEnvelope } from './assets/js/features/boards/data/board-contracts.ts';

const pass = (message) => console.log(`PASS ${message}`);

const board = { id: 'board-production-shape', name: 'New board', status: 'active', view_mode: 'table' };
const group = { id: 'group-main', board_id: board.id, title: 'Main group', position: 0 };
const legacyItem = {
  id: 'item-legacy', board_id: board.id, group_id: group.id, title: '1', position: 0, status: 'not_started',
};
const customStatus = {
  id: 'column-custom-status', board_id: board.id, name: 'New Status', data_type: 'status', position: 0, system_key: null,
  config: {
    labels: [
      { id: 'status_1c7540de892edc54437c', name: 'Not started', color: '#7f8a9a', active: true, description: '', position: 0 },
    ],
    default_label_id: 'status_1c7540de892edc54437c',
  },
};

{
  const mapped = assertBoardEnvelope({
    board,
    groups: [group],
    items: [legacyItem],
    columns: [
      customStatus,
      { id: 'column-date', board_id: board.id, name: 'New Date', data_type: 'date', position: 1, system_key: null, config: {} },
      { id: 'column-people', board_id: board.id, name: 'New People', data_type: 'people', position: 2, system_key: null, config: {} },
    ],
    values: [],
    members: [{ user_id: 'user-owner', role: 'owner' }],
  }, 'hotfix.production-flexible-board');
  assert.equal(mapped?.items[0]?.status, 'not_started');
  assert.equal(mapped?.columns[0]?.system_key, null);
  assert.equal(mapped?.columns[0]?.data_type, 'status');
  pass('flexible Boards load when legacy core item.status remains populated without a system Status column');
}

{
  const systemStatus = {
    ...customStatus,
    id: 'column-system-status',
    name: 'Status',
    system_key: 'status',
    config: {
      labels: [{ id: 'done', name: 'Done', color: '#23b784', active: true, description: '', position: 0 }],
      default_label_id: 'done',
    },
  };
  assert.throws(() => assertBoardEnvelope({
    board,
    groups: [group],
    items: [legacyItem],
    columns: [systemStatus],
    values: [],
    members: [{ user_id: 'user-owner', role: 'owner' }],
  }, 'hotfix.system-status-reference'), /unknown Status label/);
  pass('system Status columns still reject unknown persisted stable Status-label references');
}

console.log('v1.43.2 Board compatibility hotfix verification: PASS');
