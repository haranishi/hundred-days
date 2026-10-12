// 面データ。.agent-harness/runs/day065-teikoku-gohan/levels.json の写し（盤・締切・par・見本・統計）。
// ここは手で直さない。正はあちらで、tests/levels.test.mjs が中身を突き合わせる。
export const LEVELS = [
 {
  "id": "L1",
  "title": "はじめの一皿",
  "hint": "地図の分岐ボタンをタップして行き先を選び、「発車」。焼きにんじんは「焼く」だけ。",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     24,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     84,
     120
    ]
   },
   "C": {
    "kind": "cut",
    "pos": [
     144,
     60
    ]
   },
   "J2": {
    "kind": "junction",
    "pos": [
     204,
     120
    ]
   },
   "G": {
    "kind": "grill",
    "pos": [
     264,
     120
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     336,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "C",
    "len": 1
   },
   {
    "id": "e3",
    "from": "J1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "C",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e5",
    "from": "J2",
    "to": "G",
    "len": 1
   },
   {
    "id": "e6",
    "from": "G",
    "to": "S",
    "len": 1
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "carrot",
    "order": "o1"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "carrot",
    "steps": [
     "grill"
    ],
    "due": 9
   }
  ],
  "no": 1,
  "headway": 1,
  "burnGrace": 1,
  "par": 7,
  "solution": {
   "order": [
    "t1"
   ],
   "choices": {
    "t1": {
     "J1": "J2"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 1,
   "burntPlans": 0,
   "clearingPlans": 1,
   "finishDistribution": {
    "7": 1
   }
  }
 },
 {
  "id": "L2",
  "title": "ならんで待つ",
  "hint": "同じ焼き場に並ぶと、あとの列車は待たされる。どちらを先に出そう？",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     24,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     84,
     120
    ]
   },
   "C": {
    "kind": "cut",
    "pos": [
     144,
     60
    ]
   },
   "J2": {
    "kind": "junction",
    "pos": [
     204,
     120
    ]
   },
   "G": {
    "kind": "grill",
    "pos": [
     264,
     120
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     336,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "C",
    "len": 1
   },
   {
    "id": "e3",
    "from": "J1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "C",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e5",
    "from": "J2",
    "to": "G",
    "len": 1
   },
   {
    "id": "e6",
    "from": "G",
    "to": "S",
    "len": 1
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "carrot",
    "order": "o1"
   },
   {
    "id": "t2",
    "ingredient": "beef",
    "order": "o2"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "carrot",
    "steps": [
     "grill"
    ],
    "due": 11
   },
   {
    "id": "o2",
    "ingredient": "beef",
    "steps": [
     "grill"
    ],
    "due": 8
   }
  ],
  "no": 2,
  "headway": 1,
  "burnGrace": 1,
  "par": 10,
  "solution": {
   "order": [
    "t2",
    "t1"
   ],
   "choices": {
    "t1": {
     "J1": "J2"
    },
    "t2": {
     "J1": "J2"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 2,
   "burntPlans": 0,
   "clearingPlans": 1,
   "finishDistribution": {
    "10": 1
   }
  }
 },
 {
  "id": "L3",
  "title": "ふたつの焼き場",
  "hint": "焼き場は2つ。遠いほうは線路が長い。お刺身は切るだけで配膳へ行ける。",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     22,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     76,
     120
    ]
   },
   "C": {
    "kind": "cut",
    "pos": [
     110,
     62
    ]
   },
   "J2": {
    "kind": "junction",
    "pos": [
     144,
     120
    ]
   },
   "J3": {
    "kind": "junction",
    "pos": [
     204,
     120
    ]
   },
   "G1": {
    "kind": "grill",
    "pos": [
     246,
     64
    ]
   },
   "G2": {
    "kind": "grill",
    "pos": [
     246,
     176
    ]
   },
   "J4": {
    "kind": "junction",
    "pos": [
     296,
     120
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     338,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "C",
    "len": 1
   },
   {
    "id": "e3",
    "from": "C",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "J1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e5",
    "from": "J2",
    "to": "J3",
    "len": 1
   },
   {
    "id": "e6",
    "from": "J3",
    "to": "G1",
    "len": 1
   },
   {
    "id": "e7",
    "from": "G1",
    "to": "J4",
    "len": 1
   },
   {
    "id": "e8",
    "from": "J3",
    "to": "G2",
    "len": 2
   },
   {
    "id": "e9",
    "from": "G2",
    "to": "J4",
    "len": 2
   },
   {
    "id": "e10",
    "from": "J4",
    "to": "S",
    "len": 1
   },
   {
    "id": "e11",
    "from": "J2",
    "to": "S",
    "len": 2,
    "via": [
     [
      150,
      222
     ],
     [
      338,
      222
     ]
    ]
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "fish",
    "order": "o1"
   },
   {
    "id": "t2",
    "ingredient": "beef",
    "order": "o2"
   },
   {
    "id": "t3",
    "ingredient": "beef",
    "order": "o3"
   },
   {
    "id": "t4",
    "ingredient": "carrot",
    "order": "o4"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "fish",
    "steps": [
     "cut"
    ],
    "due": 11
   },
   {
    "id": "o2",
    "ingredient": "beef",
    "steps": [
     "grill"
    ],
    "due": 10
   },
   {
    "id": "o3",
    "ingredient": "beef",
    "steps": [
     "cut",
     "grill"
    ],
    "due": 13
   },
   {
    "id": "o4",
    "ingredient": "carrot",
    "steps": [
     "grill"
    ],
    "due": 16
   }
  ],
  "no": 3,
  "headway": 1,
  "burnGrace": 1,
  "par": 14,
  "solution": {
   "order": [
    "t2",
    "t3",
    "t1",
    "t4"
   ],
   "choices": {
    "t1": {
     "J1": "C",
     "J2": "S"
    },
    "t2": {
     "J1": "J2",
     "J2": "J3",
     "J3": "G1"
    },
    "t3": {
     "J1": "C",
     "J2": "J3",
     "J3": "G1"
    },
    "t4": {
     "J1": "J2",
     "J2": "J3",
     "J3": "G2"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 192,
   "burntPlans": 0,
   "clearingPlans": 5,
   "finishDistribution": {
    "14": 3,
    "15": 1,
    "16": 1
   }
  }
 },
 {
  "id": "L4",
  "title": "火の番",
  "hint": "🔥🍲は、仕上がってから1分以内に出ないと焦げる。出口の線路がふさがっていないか見よう。",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     22,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     70,
     120
    ]
   },
   "G1": {
    "kind": "grill",
    "pos": [
     150,
     50
    ],
    "time": 3
   },
   "G2": {
    "kind": "grill",
    "pos": [
     150,
     120
    ],
    "time": 4
   },
   "M": {
    "kind": "simmer",
    "pos": [
     150,
     190
    ],
    "time": 4
   },
   "J2": {
    "kind": "junction",
    "pos": [
     236,
     120
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     330,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "G1",
    "len": 1
   },
   {
    "id": "e3",
    "from": "J1",
    "to": "G2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "J1",
    "to": "M",
    "len": 1
   },
   {
    "id": "e5",
    "from": "G1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e6",
    "from": "G2",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e7",
    "from": "M",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e8",
    "from": "J2",
    "to": "S",
    "len": 4
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "beef",
    "order": "o1"
   },
   {
    "id": "t2",
    "ingredient": "fish",
    "order": "o2"
   },
   {
    "id": "t3",
    "ingredient": "egg",
    "order": "o3"
   },
   {
    "id": "t4",
    "ingredient": "carrot",
    "order": "o4"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "beef",
    "steps": [
     "grill"
    ],
    "due": 14
   },
   {
    "id": "o2",
    "ingredient": "fish",
    "steps": [
     "grill"
    ],
    "due": 24
   },
   {
    "id": "o3",
    "ingredient": "egg",
    "steps": [
     "simmer"
    ],
    "due": 24
   },
   {
    "id": "o4",
    "ingredient": "carrot",
    "steps": [
     "simmer"
    ],
    "due": 24
   }
  ],
  "no": 4,
  "headway": 1,
  "burnGrace": 1,
  "par": 22,
  "solution": {
   "order": [
    "t1",
    "t3",
    "t2",
    "t4"
   ],
   "choices": {
    "t1": {
     "J1": "G1"
    },
    "t2": {
     "J1": "G2"
    },
    "t3": {
     "J1": "M"
    },
    "t4": {
     "J1": "M"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 96,
   "burntPlans": 32,
   "clearingPlans": 16,
   "finishDistribution": {
    "22": 8,
    "23": 8
   }
  }
 },
 {
  "id": "L5",
  "title": "順番がちがう",
  "hint": "「切ってから焼く」と「焼いてから切る」は別の料理。通る順番がレシピになる。",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     22,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     70,
     120
    ]
   },
   "C1": {
    "kind": "cut",
    "pos": [
     112,
     48
    ]
   },
   "J2": {
    "kind": "junction",
    "pos": [
     170,
     64
    ]
   },
   "G1": {
    "kind": "grill",
    "pos": [
     232,
     64
    ]
   },
   "J5": {
    "kind": "junction",
    "pos": [
     300,
     120
    ]
   },
   "G2": {
    "kind": "grill",
    "pos": [
     120,
     184
    ]
   },
   "J6": {
    "kind": "junction",
    "pos": [
     176,
     184
    ]
   },
   "C2": {
    "kind": "cut",
    "pos": [
     232,
     184
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     342,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "C1",
    "len": 1
   },
   {
    "id": "e3",
    "from": "C1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e11",
    "from": "J1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "J2",
    "to": "G1",
    "len": 1
   },
   {
    "id": "e5",
    "from": "G1",
    "to": "J5",
    "len": 1
   },
   {
    "id": "e6",
    "from": "J2",
    "to": "J5",
    "len": 2,
    "via": [
     [
      170,
      20
     ],
     [
      300,
      20
     ]
    ]
   },
   {
    "id": "e7",
    "from": "J1",
    "to": "G2",
    "len": 2
   },
   {
    "id": "e8",
    "from": "G2",
    "to": "J6",
    "len": 1
   },
   {
    "id": "e9",
    "from": "J6",
    "to": "C2",
    "len": 1
   },
   {
    "id": "e12",
    "from": "C2",
    "to": "J5",
    "len": 1
   },
   {
    "id": "e13",
    "from": "J6",
    "to": "J5",
    "len": 2,
    "via": [
     [
      176,
      226
     ],
     [
      300,
      226
     ]
    ]
   },
   {
    "id": "e10",
    "from": "J5",
    "to": "S",
    "len": 1
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "fish",
    "order": "o1"
   },
   {
    "id": "t2",
    "ingredient": "beef",
    "order": "o2"
   },
   {
    "id": "t3",
    "ingredient": "beef",
    "order": "o3"
   },
   {
    "id": "t4",
    "ingredient": "beef",
    "order": "o4"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "fish",
    "steps": [
     "cut"
    ],
    "due": 12
   },
   {
    "id": "o2",
    "ingredient": "beef",
    "steps": [
     "grill"
    ],
    "due": 10
   },
   {
    "id": "o3",
    "ingredient": "beef",
    "steps": [
     "cut",
     "grill"
    ],
    "due": 15
   },
   {
    "id": "o4",
    "ingredient": "beef",
    "steps": [
     "grill",
     "cut"
    ],
    "due": 12
   }
  ],
  "no": 5,
  "headway": 1,
  "burnGrace": 1,
  "par": 13,
  "solution": {
   "order": [
    "t4",
    "t3",
    "t2",
    "t1"
   ],
   "choices": {
    "t1": {
     "J1": "C1",
     "J2": "J5"
    },
    "t2": {
     "J1": "J2",
     "J2": "G1"
    },
    "t3": {
     "J1": "C1",
     "J2": "G1"
    },
    "t4": {
     "J1": "G2",
     "J6": "C2"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 48,
   "burntPlans": 0,
   "clearingPlans": 3,
   "finishDistribution": {
    "13": 1,
    "14": 1,
    "15": 1
   }
  }
 },
 {
  "id": "L6",
  "title": "ランチタイム",
  "hint": "お昼のラッシュ！ 切る・焼く・煮るを総動員して、5つの注文をさばこう。",
  "nodes": {
   "Y": {
    "kind": "yard",
    "pos": [
     22,
     120
    ]
   },
   "J1": {
    "kind": "junction",
    "pos": [
     72,
     120
    ]
   },
   "C": {
    "kind": "cut",
    "pos": [
     114,
     60
    ]
   },
   "J2": {
    "kind": "junction",
    "pos": [
     150,
     120
    ]
   },
   "G": {
    "kind": "grill",
    "pos": [
     212,
     36
    ]
   },
   "M": {
    "kind": "simmer",
    "pos": [
     212,
     120
    ]
   },
   "G2": {
    "kind": "grill",
    "pos": [
     212,
     206
    ],
    "time": 3
   },
   "J3": {
    "kind": "junction",
    "pos": [
     282,
     120
    ]
   },
   "S": {
    "kind": "serve",
    "pos": [
     338,
     120
    ]
   }
  },
  "edges": [
   {
    "id": "e1",
    "from": "Y",
    "to": "J1",
    "len": 1
   },
   {
    "id": "e2",
    "from": "J1",
    "to": "C",
    "len": 1
   },
   {
    "id": "e3",
    "from": "C",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e4",
    "from": "J1",
    "to": "J2",
    "len": 1
   },
   {
    "id": "e5",
    "from": "J2",
    "to": "G",
    "len": 1
   },
   {
    "id": "e6",
    "from": "G",
    "to": "J3",
    "len": 1
   },
   {
    "id": "e7",
    "from": "J2",
    "to": "M",
    "len": 1
   },
   {
    "id": "e8",
    "from": "M",
    "to": "J3",
    "len": 1
   },
   {
    "id": "e9",
    "from": "J2",
    "to": "J3",
    "len": 1,
    "via": [
     [
      212,
      164
     ]
    ]
   },
   {
    "id": "e11",
    "from": "J2",
    "to": "G2",
    "len": 2
   },
   {
    "id": "e12",
    "from": "G2",
    "to": "J3",
    "len": 2
   },
   {
    "id": "e10",
    "from": "J3",
    "to": "S",
    "len": 3
   }
  ],
  "trains": [
   {
    "id": "t1",
    "ingredient": "fish",
    "order": "o1"
   },
   {
    "id": "t2",
    "ingredient": "beef",
    "order": "o2"
   },
   {
    "id": "t3",
    "ingredient": "beef",
    "order": "o3"
   },
   {
    "id": "t4",
    "ingredient": "egg",
    "order": "o4"
   },
   {
    "id": "t5",
    "ingredient": "carrot",
    "order": "o5"
   }
  ],
  "orders": [
   {
    "id": "o1",
    "ingredient": "fish",
    "steps": [
     "cut"
    ],
    "due": 11
   },
   {
    "id": "o2",
    "ingredient": "beef",
    "steps": [
     "cut",
     "grill"
    ],
    "due": 17
   },
   {
    "id": "o3",
    "ingredient": "beef",
    "steps": [
     "cut",
     "simmer"
    ],
    "due": 19
   },
   {
    "id": "o4",
    "ingredient": "egg",
    "steps": [
     "simmer"
    ],
    "due": 20
   },
   {
    "id": "o5",
    "ingredient": "carrot",
    "steps": [
     "grill"
    ],
    "due": 23
   }
  ],
  "no": 6,
  "headway": 1,
  "burnGrace": 1,
  "par": 21,
  "solution": {
   "order": [
    "t1",
    "t4",
    "t2",
    "t3",
    "t5"
   ],
   "choices": {
    "t1": {
     "J1": "C",
     "J2": "J3"
    },
    "t2": {
     "J1": "C",
     "J2": "G"
    },
    "t3": {
     "J1": "C",
     "J2": "M"
    },
    "t4": {
     "J1": "J2",
     "J2": "M"
    },
    "t5": {
     "J1": "J2",
     "J2": "G2"
    }
   }
  },
  "stats": {
   "recipeCorrectPlans": 480,
   "burntPlans": 78,
   "clearingPlans": 4,
   "finishDistribution": {
    "21": 1,
    "22": 2,
    "23": 1
   }
  }
 }
];
