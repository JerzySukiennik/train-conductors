// config.js — global constants: Firebase config, colors, assets, balance tuning (Grand Conductors v1)

export const VERSION = "v1.2";

export const FIREBASE = {
  apiKey: "AIzaSyAt9NF91wm9ysDI1xV6POLCS4naZc6fP4Y",
  authDomain: "train-conductors.firebaseapp.com",
  databaseURL: "https://train-conductors-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "train-conductors",
  storageBucket: "train-conductors.firebasestorage.app",
  messagingSenderId: "528636288830",
  appId: "1:528636288830:web:76b24c9384d465af9c966f",
};

export const COLORS = {
  slots: ["#E53935", "#1E88E5", "#FDD835"],
  npc: "#4E5A65",
  world: {
    grass: "#7CBF3F",
    dirt: "#B98A5A",
    sea: "#2E5F8A",
    ballast: "#8B6F47",
    ties: "#5D4330",
    rails: "#B8C4CC",
  },
};

export const ASSETS = {
  MODELS: {
    trains: {
      playerHead: "assets/models/trains/train-electric-city-a.glb",
      playerWagon: "assets/models/trains/train-electric-city-b.glb",
      playerTail: "assets/models/trains/train-electric-city-c.glb",
      freightLoco: "assets/models/trains/train-locomotive-a.glb",
      freightCoal: "assets/models/trains/train-carriage-coal.glb",
      freightBox: "assets/models/trains/train-carriage-box.glb",
      freightWood: "assets/models/trains/train-carriage-wood.glb",
      freightTank: "assets/models/trains/train-carriage-tank.glb",
      freightLumber: "assets/models/trains/train-carriage-lumber.glb",
      freightFlatbed: "assets/models/trains/train-carriage-flatbed.glb",
      spare: "assets/models/trains/train-diesel-a.glb",
    },
    nature: [
      "assets/models/nature/tree_pineDefaultA.glb",
      "assets/models/nature/tree_pineDefaultB.glb",
      "assets/models/nature/tree_pineTallA.glb",
      "assets/models/nature/tree_default.glb",
      "assets/models/nature/tree_oak.glb",
      "assets/models/nature/tree_fat.glb",
      "assets/models/nature/rock_largeA.glb",
      "assets/models/nature/rock_largeB.glb",
      "assets/models/nature/rock_largeC.glb",
      "assets/models/nature/rock_tallA.glb",
      "assets/models/nature/rock_tallB.glb",
      "assets/models/nature/stone_largeA.glb",
      "assets/models/nature/stone_largeB.glb",
      "assets/models/nature/stone_smallA.glb",
      "assets/models/nature/stone_smallB.glb",
      "assets/models/nature/flower_redA.glb",
      "assets/models/nature/flower_yellowA.glb",
      "assets/models/nature/flower_purpleA.glb",
      "assets/models/nature/grass.glb",
      "assets/models/nature/fence_simple.glb",
      "assets/models/nature/fence_planks.glb",
    ],
    structures: [
      "assets/models/structures/bridge_stone.glb",
      "assets/models/structures/bridge_stoneRound.glb",
      "assets/models/structures/bridge_side_stone.glb",
      "assets/models/structures/bridge_center_stone.glb",
      "assets/models/structures/cliff_block_rock.glb",
      "assets/models/structures/cliff_blockSlope_rock.glb",
      "assets/models/structures/cliff_cave_rock.glb",
      "assets/models/structures/cliff_top_rock.glb",
      "assets/models/structures/cliff_large_rock.glb",
    ],
  },
  SOUNDS: {
    horn: "https://assets.mixkit.co/active_storage/sfx/1631/1631-preview.mp3",
    hornBig: "https://assets.mixkit.co/active_storage/sfx/1654/1654-preview.mp3",
    brake: "https://assets.mixkit.co/active_storage/sfx/1629/1629-preview.mp3",
    crash: "https://assets.mixkit.co/active_storage/sfx/1703/1703-preview.mp3",
    win: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3",
    pickup: "https://assets.mixkit.co/active_storage/sfx/216/216-preview.mp3",
    bell: "https://assets.mixkit.co/active_storage/sfx/1569/1569-preview.mp3",
    click: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
    countdown: "https://assets.mixkit.co/active_storage/sfx/1952/1952-preview.mp3",
    alarm: "https://assets.mixkit.co/active_storage/sfx/1005/1005-preview.mp3",
    sheep: "https://assets.mixkit.co/active_storage/sfx/1741/1741-preview.mp3",
    carHorn: "https://assets.mixkit.co/active_storage/sfx/718/718-preview.mp3",
  },
  MUSIC: [
    "https://assets.mixkit.co/music/763/763.mp3",
    "https://assets.mixkit.co/music/764/764.mp3",
    "https://assets.mixkit.co/music/135/135.mp3",
  ],
};

export const BALANCE = {
  MAXSPEED: 2.2,
  PICKUP_SPEED: 0.6,
  STATION_RADIUS: 2.2,
  COLLISION_DIST: 1.6,
  SHEEP_FLEE_RADIUS: 6,
  SHEEP_STOP_TIME: 3,
  HORN_COOLDOWN: 1.5,
  WAGON_CAP: 5,
  AUTOPILOT_THROTTLE: 0.45,
  WARN_TTC: 3.5,
};

export const AVATAR_COUNT = 6;

export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
