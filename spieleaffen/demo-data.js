/* SpieleAffen — Demo-Daten (generiert, deterministisch). Erzählt die Story aus dem Design. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SA_DEMO_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
   "players": [
    {
     "id": "maik",
     "name": "Maik",
     "short": "MK"
    },
    {
     "id": "mattes",
     "name": "Mattes",
     "short": "MA"
    },
    {
     "id": "bene",
     "name": "Bene",
     "short": "BE"
    },
    {
     "id": "torben",
     "name": "Torben",
     "short": "TO"
    },
    {
     "id": "benni",
     "name": "Benni",
     "short": "BN"
    },
    {
     "id": "tobi",
     "name": "Tobi",
     "short": "TB"
    }
   ],
   "seasons": [
    {
     "id": "s1",
     "name": "Saison 1 · Winter 26",
     "start": "2026-01-01",
     "end": "2026-02-28"
    },
    {
     "id": "s2",
     "name": "Saison 2 · Frühjahr 26",
     "start": "2026-03-01",
     "end": "2026-05-31"
    },
    {
     "id": "s3",
     "name": "Saison 3 · Sommer 26",
     "start": "2026-06-01",
     "end": "2026-08-31"
    }
   ],
   "nights": [
    {
     "id": "n01",
     "date": "2026-01-15",
     "hostId": "maik",
     "games": [
      {
       "id": "n01_g1",
       "title": "Catan",
       "results": [
        {
         "playerId": "torben",
         "score": 12,
         "tip": 11
        },
        {
         "playerId": "mattes",
         "score": 11,
         "tip": 15
        },
        {
         "playerId": "bene",
         "score": 10,
         "tip": 12
        },
        {
         "playerId": "maik",
         "score": 9,
         "tip": 7
        },
        {
         "playerId": "benni",
         "score": 8,
         "tip": 10
        },
        {
         "playerId": "tobi",
         "score": 7,
         "tip": 11
        }
       ],
       "durationMin": 85
      },
      {
       "id": "n01_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "torben",
         "score": 4
        },
        {
         "playerId": "bene",
         "score": 7
        },
        {
         "playerId": "maik",
         "score": 8
        },
        {
         "playerId": "benni",
         "score": 10
        },
        {
         "playerId": "mattes",
         "score": 12
        },
        {
         "playerId": "tobi",
         "score": 15
        }
       ],
       "lowerWins": true,
       "durationMin": 35
      }
     ]
    },
    {
     "id": "n02",
     "date": "2026-01-29",
     "hostId": "torben",
     "games": [
      {
       "id": "n02_g1",
       "title": "Carcassonne",
       "results": [
        {
         "playerId": "mattes",
         "score": 130,
         "tip": 129
        },
        {
         "playerId": "torben",
         "score": 124,
         "tip": 127
        },
        {
         "playerId": "bene",
         "score": 123,
         "tip": 120
        },
        {
         "playerId": "benni",
         "score": 121,
         "tip": 124
        },
        {
         "playerId": "tobi",
         "score": 118,
         "tip": 121
        }
       ],
       "durationMin": 70
      },
      {
       "id": "n02_g2",
       "title": "Wizard",
       "results": [
        {
         "playerId": "mattes",
         "score": 190
        },
        {
         "playerId": "benni",
         "score": 180
        },
        {
         "playerId": "torben",
         "score": 170
        },
        {
         "playerId": "bene",
         "score": 160
        },
        {
         "playerId": "tobi",
         "score": 150
        }
       ],
       "durationMin": 55
      }
     ]
    },
    {
     "id": "n03",
     "date": "2026-02-12",
     "hostId": "bene",
     "games": [
      {
       "id": "n03_g1",
       "title": "Azul",
       "results": [
        {
         "playerId": "torben",
         "score": 93,
         "tip": 92
        },
        {
         "playerId": "bene",
         "score": 92,
         "tip": 96
        },
        {
         "playerId": "maik",
         "score": 86,
         "tip": 90
        },
        {
         "playerId": "mattes",
         "score": 81,
         "tip": 77
        },
        {
         "playerId": "benni",
         "score": 75,
         "tip": 71
        }
       ],
       "durationMin": 50
      },
      {
       "id": "n03_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "torben",
         "score": 4
        },
        {
         "playerId": "maik",
         "score": 6
        },
        {
         "playerId": "mattes",
         "score": 7
        },
        {
         "playerId": "bene",
         "score": 10
        },
        {
         "playerId": "benni",
         "score": 11
        }
       ],
       "lowerWins": true,
       "durationMin": 30
      }
     ]
    },
    {
     "id": "n04",
     "date": "2026-02-26",
     "hostId": "benni",
     "games": [
      {
       "id": "n04_g1",
       "title": "Terraforming Mars",
       "results": [
        {
         "playerId": "bene",
         "score": 109,
         "tip": 108
        },
        {
         "playerId": "torben",
         "score": 105,
         "tip": 101
        },
        {
         "playerId": "mattes",
         "score": 101,
         "tip": 104
        },
        {
         "playerId": "tobi",
         "score": 98,
         "tip": 102
        },
        {
         "playerId": "maik",
         "score": 97,
         "tip": 95
        },
        {
         "playerId": "benni",
         "score": 95,
         "tip": 97
        }
       ],
       "durationMin": 150
      }
     ]
    },
    {
     "id": "n05",
     "date": "2026-03-19",
     "hostId": "tobi",
     "games": [
      {
       "id": "n05_g1",
       "title": "Catan",
       "results": [
        {
         "playerId": "torben",
         "score": 13,
         "tip": 14
        },
        {
         "playerId": "bene",
         "score": 11,
         "tip": 9
        },
        {
         "playerId": "maik",
         "score": 9,
         "tip": 7
        },
        {
         "playerId": "tobi",
         "score": 7,
         "tip": 11
        },
        {
         "playerId": "benni",
         "score": 5,
         "tip": 3
        }
       ],
       "durationMin": 95
      },
      {
       "id": "n05_g2",
       "title": "Azul",
       "results": [
        {
         "playerId": "bene",
         "score": 93
        },
        {
         "playerId": "torben",
         "score": 91
        },
        {
         "playerId": "maik",
         "score": 89
        },
        {
         "playerId": "tobi",
         "score": 86
        },
        {
         "playerId": "benni",
         "score": 84
        }
       ],
       "durationMin": 45
      }
     ]
    },
    {
     "id": "n06",
     "date": "2026-04-09",
     "hostId": "mattes",
     "games": [
      {
       "id": "n06_g1",
       "title": "Skull King",
       "results": [
        {
         "playerId": "benni",
         "score": 140,
         "tip": 150
        },
        {
         "playerId": "mattes",
         "score": 130,
         "tip": 150
        },
        {
         "playerId": "bene",
         "score": 120,
         "tip": 140
        },
        {
         "playerId": "torben",
         "score": 110,
         "tip": 130
        },
        {
         "playerId": "tobi",
         "score": 100,
         "tip": 80
        },
        {
         "playerId": "maik",
         "score": 90,
         "tip": 70
        }
       ],
       "durationMin": 65
      },
      {
       "id": "n06_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "benni",
         "score": 2
        },
        {
         "playerId": "torben",
         "score": 4
        },
        {
         "playerId": "tobi",
         "score": 6
        },
        {
         "playerId": "mattes",
         "score": 8
        },
        {
         "playerId": "bene",
         "score": 9
        },
        {
         "playerId": "maik",
         "score": 11
        }
       ],
       "lowerWins": true,
       "durationMin": 30
      }
     ]
    },
    {
     "id": "n07",
     "date": "2026-04-30",
     "hostId": "bene",
     "games": [
      {
       "id": "n07_g1",
       "title": "Dune Imperium",
       "results": [
        {
         "playerId": "mattes",
         "score": 12,
         "tip": 8
        },
        {
         "playerId": "bene",
         "score": 11,
         "tip": 9
        },
        {
         "playerId": "torben",
         "score": 10,
         "tip": 11
        },
        {
         "playerId": "benni",
         "score": 9,
         "tip": 12
        },
        {
         "playerId": "maik",
         "score": 8,
         "tip": 5
        }
       ],
       "durationMin": 110
      }
     ]
    },
    {
     "id": "n08",
     "date": "2026-05-21",
     "hostId": "torben",
     "games": [
      {
       "id": "n08_g1",
       "title": "Cascadia",
       "results": [
        {
         "playerId": "bene",
         "score": 95,
         "tip": 96
        },
        {
         "playerId": "mattes",
         "score": 94,
         "tip": 91
        },
        {
         "playerId": "tobi",
         "score": 91,
         "tip": 87
        },
        {
         "playerId": "maik",
         "score": 87,
         "tip": 83
        },
        {
         "playerId": "torben",
         "score": 83,
         "tip": 79
        },
        {
         "playerId": "benni",
         "score": 82,
         "tip": 80
        }
       ],
       "durationMin": 55
      },
      {
       "id": "n08_g2",
       "title": "Heat",
       "results": [
        {
         "playerId": "bene",
         "score": 24
        },
        {
         "playerId": "tobi",
         "score": 23
        },
        {
         "playerId": "maik",
         "score": 22
        },
        {
         "playerId": "torben",
         "score": 21
        },
        {
         "playerId": "mattes",
         "score": 20
        },
        {
         "playerId": "benni",
         "score": 19
        }
       ],
       "durationMin": 60
      }
     ]
    },
    {
     "id": "n09",
     "date": "2026-06-04",
     "hostId": "bene",
     "games": [
      {
       "id": "n09_g1",
       "title": "Catan",
       "results": [
        {
         "playerId": "bene",
         "score": 12,
         "tip": 11
        },
        {
         "playerId": "torben",
         "score": 11,
         "tip": 8
        },
        {
         "playerId": "mattes",
         "score": 10,
         "tip": 12
        },
        {
         "playerId": "benni",
         "score": 9,
         "tip": 13
        },
        {
         "playerId": "maik",
         "score": 8,
         "tip": 12
        }
       ],
       "durationMin": 90
      },
      {
       "id": "n09_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "bene",
         "score": 4
        },
        {
         "playerId": "mattes",
         "score": 6
        },
        {
         "playerId": "benni",
         "score": 8
        },
        {
         "playerId": "torben",
         "score": 10
        },
        {
         "playerId": "maik",
         "score": 12
        }
       ],
       "lowerWins": true,
       "durationMin": 35
      }
     ]
    },
    {
     "id": "n10",
     "date": "2026-06-11",
     "hostId": "torben",
     "games": [
      {
       "id": "n10_g1",
       "title": "Wizard",
       "results": [
        {
         "playerId": "torben",
         "score": 210,
         "tip": 200
        },
        {
         "playerId": "mattes",
         "score": 200,
         "tip": 230
        },
        {
         "playerId": "bene",
         "score": 190,
         "tip": 160
        },
        {
         "playerId": "tobi",
         "score": 180,
         "tip": 160
        },
        {
         "playerId": "benni",
         "score": 170,
         "tip": 210
        }
       ],
       "durationMin": 60
      },
      {
       "id": "n10_g2",
       "title": "Carcassonne",
       "results": [
        {
         "playerId": "torben",
         "score": 129
        },
        {
         "playerId": "bene",
         "score": 127
        },
        {
         "playerId": "tobi",
         "score": 125
        },
        {
         "playerId": "mattes",
         "score": 118
        },
        {
         "playerId": "benni",
         "score": 111
        }
       ],
       "durationMin": 75
      }
     ]
    },
    {
     "id": "n11",
     "date": "2026-06-18",
     "hostId": "maik",
     "games": [
      {
       "id": "n11_g1",
       "title": "Azul",
       "results": [
        {
         "playerId": "maik",
         "score": 95,
         "tip": 93
        },
        {
         "playerId": "mattes",
         "score": 94,
         "tip": 93
        },
        {
         "playerId": "torben",
         "score": 90,
         "tip": 88
        },
        {
         "playerId": "tobi",
         "score": 88,
         "tip": 84
        },
        {
         "playerId": "bene",
         "score": 86,
         "tip": 89
        },
        {
         "playerId": "benni",
         "score": 84,
         "tip": 86
        }
       ],
       "durationMin": 50
      },
      {
       "id": "n11_g2",
       "title": "Skull King",
       "results": [
        {
         "playerId": "maik",
         "score": 130
        },
        {
         "playerId": "tobi",
         "score": 120
        },
        {
         "playerId": "bene",
         "score": 110
        },
        {
         "playerId": "mattes",
         "score": 100
        },
        {
         "playerId": "torben",
         "score": 90
        },
        {
         "playerId": "benni",
         "score": 80
        }
       ],
       "durationMin": 70
      }
     ]
    },
    {
     "id": "n12",
     "date": "2026-06-25",
     "hostId": "benni",
     "games": [
      {
       "id": "n12_g1",
       "title": "Dune Imperium",
       "results": [
        {
         "playerId": "bene",
         "score": 13,
         "tip": 15
        },
        {
         "playerId": "mattes",
         "score": 12,
         "tip": 14
        },
        {
         "playerId": "tobi",
         "score": 11,
         "tip": 8
        },
        {
         "playerId": "torben",
         "score": 10,
         "tip": 9
        },
        {
         "playerId": "benni",
         "score": 9,
         "tip": 7
        },
        {
         "playerId": "maik",
         "score": 8,
         "tip": 4
        }
       ],
       "durationMin": 105
      }
     ]
    },
    {
     "id": "n13",
     "date": "2026-07-02",
     "hostId": "mattes",
     "games": [
      {
       "id": "n13_g1",
       "title": "Cascadia",
       "results": [
        {
         "playerId": "mattes",
         "score": 93,
         "tip": 92
        },
        {
         "playerId": "torben",
         "score": 89,
         "tip": 87
        },
        {
         "playerId": "tobi",
         "score": 88,
         "tip": 85
        },
        {
         "playerId": "bene",
         "score": 86,
         "tip": 83
        },
        {
         "playerId": "maik",
         "score": 83,
         "tip": 85
        }
       ],
       "durationMin": 55
      },
      {
       "id": "n13_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "mattes",
         "score": 4
        },
        {
         "playerId": "bene",
         "score": 5
        },
        {
         "playerId": "tobi",
         "score": 6
        },
        {
         "playerId": "torben",
         "score": 8
        },
        {
         "playerId": "maik",
         "score": 11
        }
       ],
       "lowerWins": true,
       "durationMin": 30
      }
     ]
    },
    {
     "id": "n14",
     "date": "2026-07-09",
     "hostId": "torben",
     "games": [
      {
       "id": "n14_g1",
       "title": "Catan",
       "results": [
        {
         "playerId": "torben",
         "score": 12,
         "tip": 11
        },
        {
         "playerId": "bene",
         "score": 11,
         "tip": 14
        },
        {
         "playerId": "mattes",
         "score": 10,
         "tip": 14
        },
        {
         "playerId": "tobi",
         "score": 9,
         "tip": 6
        },
        {
         "playerId": "benni",
         "score": 8,
         "tip": 10
        }
       ],
       "durationMin": 100
      }
     ]
    },
    {
     "id": "n15",
     "date": "2026-07-16",
     "hostId": "maik",
     "games": [
      {
       "id": "n15_g1",
       "title": "Heat",
       "results": [
        {
         "playerId": "mattes",
         "score": 24,
         "tip": 20
        },
        {
         "playerId": "maik",
         "score": 23,
         "tip": 20
        },
        {
         "playerId": "torben",
         "score": 22,
         "tip": 21
        },
        {
         "playerId": "benni",
         "score": 21,
         "tip": 23
        }
       ],
       "durationMin": 65
      },
      {
       "id": "n15_g2",
       "title": "Azul",
       "results": [
        {
         "playerId": "mattes",
         "score": 94
        },
        {
         "playerId": "torben",
         "score": 89
        },
        {
         "playerId": "maik",
         "score": 81
        },
        {
         "playerId": "benni",
         "score": 77
        }
       ],
       "durationMin": 45
      }
     ]
    },
    {
     "id": "n16",
     "date": "2026-07-21",
     "hostId": "bene",
     "games": [
      {
       "id": "n16_g1",
       "title": "Wizard",
       "results": [
        {
         "playerId": "bene",
         "score": 210,
         "tip": 200
        },
        {
         "playerId": "mattes",
         "score": 200,
         "tip": 220
        },
        {
         "playerId": "tobi",
         "score": 190,
         "tip": 230
        },
        {
         "playerId": "torben",
         "score": 180,
         "tip": 220
        },
        {
         "playerId": "maik",
         "score": 170,
         "tip": 140
        },
        {
         "playerId": "benni",
         "score": 160,
         "tip": 140
        }
       ],
       "durationMin": 60
      }
     ]
    },
    {
     "id": "n17",
     "date": "2026-07-24",
     "hostId": "mattes",
     "games": [
      {
       "id": "n17_g1",
       "title": "Terraforming Mars",
       "results": [
        {
         "playerId": "mattes",
         "score": 108,
         "tip": 107
        },
        {
         "playerId": "bene",
         "score": 103,
         "tip": 105
        },
        {
         "playerId": "torben",
         "score": 99,
         "tip": 95
        },
        {
         "playerId": "tobi",
         "score": 96,
         "tip": 100
        },
        {
         "playerId": "benni",
         "score": 91,
         "tip": 89
        }
       ],
       "durationMin": 140
      }
     ]
    },
    {
     "id": "n18",
     "date": "2026-07-28",
     "hostId": "benni",
     "games": [
      {
       "id": "n18_g1",
       "title": "Wizard",
       "results": [
        {
         "playerId": "mattes",
         "score": 190,
         "tip": 150
        },
        {
         "playerId": "bene",
         "score": 180,
         "tip": 140
        },
        {
         "playerId": "maik",
         "score": 170,
         "tip": 140
        },
        {
         "playerId": "torben",
         "score": 160,
         "tip": 160
        },
        {
         "playerId": "tobi",
         "score": 150,
         "tip": 170
        },
        {
         "playerId": "benni",
         "score": 140,
         "tip": 170
        }
       ],
       "durationMin": 65
      },
      {
       "id": "n18_g2",
       "title": "6 nimmt!",
       "results": [
        {
         "playerId": "mattes",
         "score": 2
        },
        {
         "playerId": "bene",
         "score": 5
        },
        {
         "playerId": "tobi",
         "score": 6
        },
        {
         "playerId": "maik",
         "score": 8
        },
        {
         "playerId": "torben",
         "score": 9
        },
        {
         "playerId": "benni",
         "score": 10
        }
       ],
       "lowerWins": true,
       "durationMin": 35
      }
     ]
    },
    {
     "id": "n19",
     "date": "2026-07-31",
     "hostId": "torben",
     "games": [
      {
       "id": "n19_g1",
       "title": "Catan",
       "results": [
        {
         "playerId": "mattes",
         "score": 10,
         "tip": 11
        },
        {
         "playerId": "bene",
         "score": 9,
         "tip": 5
        },
        {
         "playerId": "maik",
         "score": 8,
         "tip": 12
        },
        {
         "playerId": "torben",
         "score": 6,
         "tip": 4
        },
        {
         "playerId": "benni",
         "score": 4,
         "tip": 9
        }
       ],
       "durationMin": 92
      }
     ]
    },
    {
     "id": "n20",
     "date": "2026-08-14",
     "time": "19:30",
     "hostId": "torben",
     "plannedGames": "Dune Imperium, danach 6 nimmt!",
     "yes": [
      "torben",
      "mattes",
      "bene",
      "benni"
     ],
     "games": []
    }
   ]
  };
});
