/**
 * CSE 2407 assessment structure.
 *
 * Mirrors the course's published assessment list, including the Canvas
 * assignment id for each entry, which is what lets an imported Canvas page be
 * matched up reliably. Update this when the course updates its assessments.
 *
 * Shape:
 *   learningGoals[goalNum].subgoals[subgoalId].assessments -> assessment ids
 *   learningGoals[goalNum].global_assessments              -> assessment ids
 *   assessments[]                                          -> { id, name, canvasId, lgLabel }
 */
const ASSESSMENT_DATA = {
  "learningGoals": {
    "0": {
      "name": "Professional Skills and Tools",
      "subgoals": {
        "0.3": {
          "name": "Technical Communication",
          "assessments": [
            7,
            8,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21
          ]
        },
        "0.4": {
          "name": "Collaboration",
          "assessments": [
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33
          ]
        }
      }
    },
    "1": {
      "name": "Linear ADTs and Data Structs",
      "subgoals": {
        "1.1": {
          "name": "Linear ADTs",
          "assessments": [
            35,
            37,
            39
          ]
        },
        "1.2": {
          "name": "Implementation Analysis",
          "assessments": [
            36,
            38,
            39
          ]
        }
      },
      "global_assessments": [
        34
      ]
    },
    "2": {
      "name": "Asymptotic Analysis Fundamentals",
      "subgoals": {
        "2.1": {
          "name": "Complexity Notation and Proofs",
          "assessments": [
            41,
            42,
            44
          ]
        },
        "2.2": {
          "name": "Runtime analysis",
          "assessments": [
            41,
            43,
            45
          ]
        }
      },
      "global_assessments": [
        40
      ]
    },
    "3": {
      "name": "Searching and Sorting",
      "subgoals": {
        "3.1": {
          "name": "Search Implementation",
          "assessments": [
            47,
            49,
            51,
            53
          ]
        },
        "3.2": {
          "name": "Sort Implementation",
          "assessments": [
            47,
            48,
            50,
            52,
            54
          ]
        }
      },
      "global_assessments": [
        46
      ]
    },
    "4": {
      "name": "Recurrences and Recursive Algorithms",
      "subgoals": {
        "4.1": {
          "name": "Defining a Recurrence",
          "assessments": [
            56,
            58,
            60
          ]
        },
        "4.2": {
          "name": "Recurrence Analysis with Charts",
          "assessments": [
            56,
            58,
            60
          ]
        },
        "4.3": {
          "name": "Recurrence Analysis with the Master Theorem",
          "assessments": [
            57,
            59,
            61
          ]
        }
      },
      "global_assessments": [
        55
      ]
    },
    "5": {
      "name": "Trees",
      "subgoals": {
        "5.1": {
          "name": "Tree Operations and Properties",
          "assessments": [
            63,
            65,
            68
          ]
        },
        "5.2": {
          "name": "Balanced BST Implementation",
          "assessments": [
            64,
            66,
            67,
            69
          ]
        }
      },
      "global_assessments": [
        62
      ]
    },
    "6": {
      "name": "Priority Queues",
      "subgoals": {
        "6.1": {
          "name": "Heap Operations and Analysis",
          "assessments": [
            71,
            73,
            74
          ]
        },
        "6.2": {
          "name": "PQs",
          "assessments": [
            71,
            72,
            75
          ]
        }
      },
      "global_assessments": [
        70
      ]
    },
    "7": {
      "name": "Hashing",
      "subgoals": {
        "7.1": {
          "name": "Hash Table Implementation",
          "assessments": [
            77,
            78,
            79
          ]
        },
        "7.2": {
          "name": "Hash Function Design",
          "assessments": [
            77,
            78,
            80,
            81
          ]
        }
      },
      "global_assessments": [
        76
      ]
    },
    "8": {
      "name": "Graph Representations and Algorithms",
      "subgoals": {
        "8.1": {
          "name": "Graph Representations and Traversal",
          "assessments": [
            83,
            86,
            89
          ]
        },
        "8.2": {
          "name": "Shortest Path Algorithms",
          "assessments": [
            84,
            87,
            88,
            90
          ]
        },
        "8.3": {
          "name": "Minimum Spanning Trees",
          "assessments": [
            85,
            91,
            92
          ]
        }
      },
      "global_assessments": [
        82
      ]
    }
  },
  "assessments": [
    {
      "id": 0,
      "name": "Course Setup/Policies Quiz",
      "canvasId": "975118",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.2"
      ]
    },
    {
      "id": 1,
      "name": "zyBooks LG 0",
      "canvasId": "975424",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 2,
      "name": "MCQs: Java fundamentals (LG 0.1)",
      "canvasId": "994048",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 3,
      "name": "MCQs: ADT/implementation (LG 0.1)",
      "canvasId": "994049",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 4,
      "name": "Program Set-up Check (LG 0.1)",
      "canvasId": "975188",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 5,
      "name": "AI Literacy for the WashU Scholar",
      "canvasId": "975120",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 6,
      "name": "Week 1 Studio (LG 0.1)",
      "canvasId": "975200",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 7,
      "name": "Code interview 1 (LG 0.3)",
      "canvasId": "975126",
      "lgLabel": "LG 0.3",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 8,
      "name": "Code interview 2 (LG 0.3)",
      "canvasId": "975127",
      "lgLabel": "LG 0.3",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 9,
      "name": "Knowledge Check (LG 0.1)",
      "canvasId": "975138",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.1"
      ]
    },
    {
      "id": 10,
      "name": "Sorting Program Writeup (LG 3.1) Typesetting",
      "canvasId": "975196",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 11,
      "name": "Sorting Program Writeup (LG 3.2) Typesetting",
      "canvasId": "975198",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 12,
      "name": "AVL Program Writeup (LG 4.2) Typesetting",
      "canvasId": "975123",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 13,
      "name": "AVL Program Writeup (LG 4.1) Typesetting",
      "canvasId": "975122",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 14,
      "name": "Knowledge Check (LG 4.1, 4.2) Typesetting",
      "canvasId": "975148",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 15,
      "name": "Knowledge Check (LG 4.3) Typesetting",
      "canvasId": "975149",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 16,
      "name": "PQ Program Writeup (LG 6.1) Typesetting",
      "canvasId": "975182",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 17,
      "name": "PQ Program Writeup (LG 6.2) Typesetting",
      "canvasId": "975184",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 18,
      "name": "Hashing Program Writeup (LG 7.1) Typesetting",
      "canvasId": "975135",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 19,
      "name": "Hashing Program Writeup (LG 7.2) Typesetting",
      "canvasId": "975137",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 20,
      "name": "SPaths Program Writeup (LG 8.1) Typesetting",
      "canvasId": "975191",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 21,
      "name": "SPaths Program Writeup (LG 8.2) Typesetting",
      "canvasId": "975193",
      "lgLabel": "LG 0.1",
      "goals": [],
      "subgoals": [
        "0.3"
      ]
    },
    {
      "id": 22,
      "name": "End of Semester Survey",
      "canvasId": "975119",
      "lgLabel": "LG 0",
      "goals": [],
      "subgoals": [
        "0.2"
      ]
    },
    {
      "id": 23,
      "name": "Week 1 Studio Participation (LG 0.2)",
      "canvasId": "975201",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 24,
      "name": "Week 2 Studio Participation (LG 0.2)",
      "canvasId": "975210",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 25,
      "name": "Week 3 Studio Participation (LG 0.2)",
      "canvasId": "975214",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 26,
      "name": "Week 4 Studio Participation (LG 0.2)",
      "canvasId": "975217",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 27,
      "name": "Week 5 Studio Participation (LG 0.2)",
      "canvasId": "975220",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 28,
      "name": "Week 7 Studio Participation (LG 0.2)",
      "canvasId": "975223",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 29,
      "name": "Week 8 Studio Participation (LG 0.2)",
      "canvasId": "975226",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 30,
      "name": "Week 9 Studio Participation (LG 0.2)",
      "canvasId": "975229",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 31,
      "name": "Week 11 Studio Participation (LG 0.2)",
      "canvasId": "975203",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 32,
      "name": "Week 12 Studio Participation (LG 0.2)",
      "canvasId": "975206",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 33,
      "name": "Week 13 Studio Participation (LG 0.2)",
      "canvasId": "975208",
      "lgLabel": "LG 0.2",
      "goals": [],
      "subgoals": [
        "0.4"
      ]
    },
    {
      "id": 34,
      "name": "zyBooks LG 1",
      "canvasId": "975425",
      "lgLabel": "LG 1",
      "goals": [
        "1"
      ],
      "subgoals": []
    },
    {
      "id": 35,
      "name": "MCQs: Linear ADTs / data structs (LG 1.1)",
      "canvasId": "994060",
      "lgLabel": "LG 1.1",
      "goals": [],
      "subgoals": [
        "1.1"
      ]
    },
    {
      "id": 36,
      "name": "MCQs: Linear ADTs  implementations (LG 1.2)",
      "canvasId": "994061",
      "lgLabel": "LG 1.2",
      "goals": [],
      "subgoals": [
        "1.2"
      ]
    },
    {
      "id": 37,
      "name": "Knowledge Check (LG 1.1)",
      "canvasId": "975139",
      "lgLabel": "LG 1.1",
      "goals": [],
      "subgoals": [
        "1.1"
      ]
    },
    {
      "id": 38,
      "name": "Knowledge Check (LG 1.2)",
      "canvasId": "975140",
      "lgLabel": "LG 1.2",
      "goals": [],
      "subgoals": [
        "1.2"
      ]
    },
    {
      "id": 39,
      "name": "Week 2 Studio (LG 1.1, 1.2)",
      "canvasId": "975209",
      "lgLabel": "LG 1.1, 1.2",
      "goals": [],
      "subgoals": [
        "1.1",
        "1.2"
      ]
    },
    {
      "id": 40,
      "name": "zyBooks LG 2",
      "canvasId": "975426",
      "lgLabel": "LG 2",
      "goals": [
        "2"
      ],
      "subgoals": []
    },
    {
      "id": 41,
      "name": "MCQs: Analysis (LG 2.1, 2.2)",
      "canvasId": "994050",
      "lgLabel": "LG 2.1, 2.2",
      "goals": [],
      "subgoals": [
        "2.1",
        "2.2"
      ]
    },
    {
      "id": 42,
      "name": "Week 3 Studio (LG 2.1)",
      "canvasId": "975212",
      "lgLabel": "LG 2.1",
      "goals": [],
      "subgoals": [
        "2.1"
      ]
    },
    {
      "id": 43,
      "name": "Week 3 Studio (LG 2.2)",
      "canvasId": "975213",
      "lgLabel": "LG 2.2",
      "goals": [],
      "subgoals": [
        "2.2"
      ]
    },
    {
      "id": 44,
      "name": "Knowledge Check (LG 2.1)",
      "canvasId": "975141",
      "lgLabel": "LG 2.1",
      "goals": [],
      "subgoals": [
        "2.1"
      ]
    },
    {
      "id": 45,
      "name": "Knowledge Check (LG 2.2)",
      "canvasId": "975142",
      "lgLabel": "LG 2.2",
      "goals": [],
      "subgoals": [
        "2.2"
      ]
    },
    {
      "id": 46,
      "name": "zyBooks LG 3",
      "canvasId": "975422",
      "lgLabel": "LG 3",
      "goals": [
        "3"
      ],
      "subgoals": []
    },
    {
      "id": 47,
      "name": "MCQs: Searching and Sorting (LG 3.1, 3.2)",
      "canvasId": "994051",
      "lgLabel": "LG 3.1,3.2",
      "goals": [],
      "subgoals": [
        "3.1",
        "3.2"
      ]
    },
    {
      "id": 48,
      "name": "Sorting Program Code (LG 3.2)",
      "canvasId": "975194",
      "lgLabel": "LG 3.2",
      "goals": [],
      "subgoals": [
        "3.2"
      ]
    },
    {
      "id": 49,
      "name": "Sorting Program Writeup (LG 3.1)",
      "canvasId": "975195",
      "lgLabel": "LG 3.1",
      "goals": [],
      "subgoals": [
        "3.1"
      ]
    },
    {
      "id": 50,
      "name": "Sorting Program Writeup (LG 3.2)",
      "canvasId": "975197",
      "lgLabel": "LG 3.2",
      "goals": [],
      "subgoals": [
        "3.2"
      ]
    },
    {
      "id": 51,
      "name": "Week 4 Studio (LG 3.1)",
      "canvasId": "975215",
      "lgLabel": "LG 3.1",
      "goals": [],
      "subgoals": [
        "3.1"
      ]
    },
    {
      "id": 52,
      "name": "Week 4 Studio (LG 3.2)",
      "canvasId": "975216",
      "lgLabel": "LG 3.2",
      "goals": [],
      "subgoals": [
        "3.2"
      ]
    },
    {
      "id": 53,
      "name": "Knowledge Check (LG 3.1)",
      "canvasId": "975143",
      "lgLabel": "LG 3.1",
      "goals": [],
      "subgoals": [
        "3.1"
      ]
    },
    {
      "id": 54,
      "name": "Knowledge Check (LG 3.2)",
      "canvasId": "975144",
      "lgLabel": "LG 3.2",
      "goals": [],
      "subgoals": [
        "3.2"
      ]
    },
    {
      "id": 55,
      "name": "zyBooks LG 4",
      "canvasId": "975427",
      "lgLabel": "LG 4",
      "goals": [
        "4"
      ],
      "subgoals": []
    },
    {
      "id": 56,
      "name": "MCQs: recurrences and recursion trees (LG 4.1, 4.2)",
      "canvasId": "994052",
      "lgLabel": "LG 4.1, 4.2",
      "goals": [],
      "subgoals": [
        "4.1",
        "4.2"
      ]
    },
    {
      "id": 57,
      "name": "MCQs: recurrences and master theorem (LG 4.3)",
      "canvasId": "994062",
      "lgLabel": "LG 4.3",
      "goals": [],
      "subgoals": [
        "4.3"
      ]
    },
    {
      "id": 58,
      "name": "Week 5 Studio (LG 4.1, 4.2)",
      "canvasId": "975219",
      "lgLabel": "LG 4.1, 4.2",
      "goals": [],
      "subgoals": [
        "4.1",
        "4.2"
      ]
    },
    {
      "id": 59,
      "name": "Week 7 Studio (LG 4.3)",
      "canvasId": "975221",
      "lgLabel": "LG 4.3",
      "goals": [],
      "subgoals": [
        "4.3"
      ]
    },
    {
      "id": 60,
      "name": "Knowledge Check (LG 4.1, 4.2)",
      "canvasId": "975145",
      "lgLabel": "LG 4.1, 4.2",
      "goals": [],
      "subgoals": [
        "4.1",
        "4.2"
      ]
    },
    {
      "id": 61,
      "name": "Knowledge Check (LG 4.3)",
      "canvasId": "975147",
      "lgLabel": "LG 4.3",
      "goals": [],
      "subgoals": [
        "4.3"
      ]
    },
    {
      "id": 62,
      "name": "zyBooks LG 5",
      "canvasId": "975428",
      "lgLabel": "LG 5",
      "goals": [
        "5"
      ],
      "subgoals": []
    },
    {
      "id": 63,
      "name": "MCQs: BSTs (LG 5.1)",
      "canvasId": "994053",
      "lgLabel": "LG 5.1",
      "goals": [],
      "subgoals": [
        "5.1"
      ]
    },
    {
      "id": 64,
      "name": "MCQs: Balanced BSTs (LG 5.2)",
      "canvasId": "994054",
      "lgLabel": "LG 5.2",
      "goals": [],
      "subgoals": [
        "5.2"
      ]
    },
    {
      "id": 65,
      "name": "Week 8 Studio (LG 5.1)",
      "canvasId": "975222",
      "lgLabel": "LG 5.1",
      "goals": [],
      "subgoals": [
        "5.1"
      ]
    },
    {
      "id": 66,
      "name": "Week 9 Studio (LG 5.2)",
      "canvasId": "975225",
      "lgLabel": "LG 5.3",
      "goals": [],
      "subgoals": [
        "5.2"
      ]
    },
    {
      "id": 67,
      "name": "AVL Program Code (LG 5.2)",
      "canvasId": "975121",
      "lgLabel": "LG 5.2",
      "goals": [],
      "subgoals": [
        "5.2"
      ]
    },
    {
      "id": 68,
      "name": "AVL Program Writeup (LG 5.1)",
      "canvasId": "975124",
      "lgLabel": "LG 5.1",
      "goals": [],
      "subgoals": [
        "5.1"
      ]
    },
    {
      "id": 69,
      "name": "AVL Program Writeup (LG 5.2)",
      "canvasId": "975125",
      "lgLabel": "LG 5.2",
      "goals": [],
      "subgoals": [
        "5.2"
      ]
    },
    {
      "id": 70,
      "name": "zyBooks LG 6",
      "canvasId": "975429",
      "lgLabel": "LG 6",
      "goals": [
        "6"
      ],
      "subgoals": []
    },
    {
      "id": 71,
      "name": "MCQs: Priority Queues and Heaps (LG 6.1, 6.2)",
      "canvasId": "994055",
      "lgLabel": "LG 6.1, 6.2",
      "goals": [],
      "subgoals": [
        "6.1",
        "6.2"
      ]
    },
    {
      "id": 72,
      "name": "Week 10 Studio (LG 6.2)",
      "canvasId": "975228",
      "lgLabel": "LG 6.2",
      "goals": [],
      "subgoals": [
        "6.2"
      ]
    },
    {
      "id": 73,
      "name": "PQ Program Code (LG 6.1)",
      "canvasId": "975180",
      "lgLabel": "LG 6.1",
      "goals": [],
      "subgoals": [
        "6.1"
      ]
    },
    {
      "id": 74,
      "name": "PQ Program Writeup (LG 6.1)",
      "canvasId": "975181",
      "lgLabel": "LG 6.1",
      "goals": [],
      "subgoals": [
        "6.1"
      ]
    },
    {
      "id": 75,
      "name": "PQ Program Writeup (LG 6.2)",
      "canvasId": "975183",
      "lgLabel": "LG 6.2",
      "goals": [],
      "subgoals": [
        "6.2"
      ]
    },
    {
      "id": 76,
      "name": "zyBooks LG 7",
      "canvasId": "996307",
      "lgLabel": "LG 7",
      "goals": [
        "7"
      ],
      "subgoals": []
    },
    {
      "id": 77,
      "name": "MCQs: Maps and Hashing (LG 7.1, 7.2)",
      "canvasId": "994056",
      "lgLabel": "LG 7.1, 7.2",
      "goals": [],
      "subgoals": [
        "7.1",
        "7.2"
      ]
    },
    {
      "id": 78,
      "name": "Hashing Program Code (LG 7.1, 7.2)",
      "canvasId": "975133",
      "lgLabel": "LG 7.1, 7.2",
      "goals": [],
      "subgoals": [
        "7.1",
        "7.2"
      ]
    },
    {
      "id": 79,
      "name": "Hashing Program Writeup (LG 7.1)",
      "canvasId": "975134",
      "lgLabel": "LG 7.1",
      "goals": [],
      "subgoals": [
        "7.1"
      ]
    },
    {
      "id": 80,
      "name": "Hashing Program Writeup (LG 7.2)",
      "canvasId": "975136",
      "lgLabel": "LG 7.2",
      "goals": [],
      "subgoals": [
        "7.2"
      ]
    },
    {
      "id": 81,
      "name": "Knowledge Check (LG 7.2)",
      "canvasId": "975150",
      "lgLabel": "LG 7.2",
      "goals": [],
      "subgoals": [
        "7.2"
      ]
    },
    {
      "id": 82,
      "name": "zyBooks LG 8",
      "canvasId": "975423",
      "lgLabel": "LG 8",
      "goals": [
        "8"
      ],
      "subgoals": []
    },
    {
      "id": 83,
      "name": "MCQs: Graphs and Graph Search (LG 8.1)",
      "canvasId": "994057",
      "lgLabel": "LG 8.1",
      "goals": [],
      "subgoals": [
        "8.1"
      ]
    },
    {
      "id": 84,
      "name": "MCQs: Shortest Paths (LG 8.2)",
      "canvasId": "994058",
      "lgLabel": "LG 8.2",
      "goals": [],
      "subgoals": [
        "8.2"
      ]
    },
    {
      "id": 85,
      "name": "MCQs: MSTs (LG 8.3)",
      "canvasId": "994059",
      "lgLabel": "LG 8.3",
      "goals": [],
      "subgoals": [
        "8.3"
      ]
    },
    {
      "id": 86,
      "name": "Week 12 Studio (LG 8.1)",
      "canvasId": "975202",
      "lgLabel": "LG 8.1",
      "goals": [],
      "subgoals": [
        "8.1"
      ]
    },
    {
      "id": 87,
      "name": "Week 13 Studio (LG 8.2)",
      "canvasId": "975205",
      "lgLabel": "LG 8.2",
      "goals": [],
      "subgoals": [
        "8.2"
      ]
    },
    {
      "id": 88,
      "name": "SPaths Program Code (LG 8.2)",
      "canvasId": "975189",
      "lgLabel": "LG 8.2",
      "goals": [],
      "subgoals": [
        "8.2"
      ]
    },
    {
      "id": 89,
      "name": "SPaths Program Writeup (LG 8.1)",
      "canvasId": "975190",
      "lgLabel": "LG 8.1",
      "goals": [],
      "subgoals": [
        "8.1"
      ]
    },
    {
      "id": 90,
      "name": "SPaths Program Writeup (LG 8.2)",
      "canvasId": "975192",
      "lgLabel": "LG 8.2",
      "goals": [],
      "subgoals": [
        "8.2"
      ]
    },
    {
      "id": 91,
      "name": "Knowledge Check (LG 8.3)",
      "canvasId": "975151",
      "lgLabel": "LG 8.3",
      "goals": [],
      "subgoals": [
        "8.3"
      ]
    },
    {
      "id": 92,
      "name": "Week 14 Studio (LG 8.3)",
      "canvasId": "975207",
      "lgLabel": "LG 8.3",
      "goals": [],
      "subgoals": [
        "8.3"
      ]
    },
    {
      "id": 93,
      "name": "Special Topics Assignment",
      "canvasId": "1004540",
      "lgLabel": "",
      "goals": [],
      "subgoals": []
    },
    {
      "id": 94,
      "name": "Special Topics Credit",
      "canvasId": "1004542",
      "lgLabel": "",
      "goals": [],
      "subgoals": []
    }
  ]
};
