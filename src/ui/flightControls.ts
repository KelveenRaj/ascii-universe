export type Group = { title: string; rows: Array<[string, string]> };

/** Flying your ship in the open world (also the new pilot's controls card). */
export const FLIGHT_GROUPS: Group[] = [
  {
    title: 'KEYBOARD',
    rows: [
      ['W / S', 'THROTTLE UP / DOWN'],
      ['ARROWS / A D', 'STEER'],
      ['Q / E', 'ROLL'],
      ['SHIFT', 'BOOST'],
      ['X', 'STOP'],
      ['T', 'TARGET WHAT YOU FACE'],
      ['J', 'JUMP TO TARGET / LEAVE'],
      ['ESC', 'LAND (BACK TO INFO)'],
    ],
  },
  {
    title: 'MOUSE / TOUCH',
    rows: [
      ['DRAG', 'STEER'],
      ['MINIMAP', 'CLICK SOL / SGR A* TO JUMP'],
      ['THR + / THR -', 'THROTTLE'],
      ['BST / STOP', 'BOOST / STOP'],
      ['TGT', 'TARGET WHAT YOU FACE'],
      ['HANGAR', 'DESIGN YOUR SHIP'],
    ],
  },
];
