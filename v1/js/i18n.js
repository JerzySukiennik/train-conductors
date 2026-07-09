// i18n.js — PL/EN dictionary with {var} interpolation, localStorage-persisted language (Grand Conductors v1)

const STORE_KEY = "gc.lang";

const PL = {
  "connect.title": "Wielcy Konduktorzy",
  "connect.sub": "Wsiadać! Pierwszy skan zostaje szefem stacji 🚂",
  "connect.scanHint": "Zeskanuj kod QR telefonem",
  "connect.orCode": "albo wpisz kod na telefonie",
  "connect.subtitle": "Wsiadać! Pierwszy skan zostaje szefem stacji 🚂",
  "connect.hint": "Zeskanuj kod QR telefonem albo wpisz kod niżej",

  "join.codePrompt": "Wpisz kod pokoju",
  "join.nickPrompt": "Jak się nazywasz, konduktorze?",
  "join.nickPlaceholder": "Twój nick",
  "join.joinBtn": "Wsiadam!",
  "join.errBadCode": "Nie ma takiego pokoju. Sprawdź kod!",
  "join.errFull": "Skład pełny — wszystkie miejsca zajęte.",
  "join.errStarted": "Pociąg już odjechał! Gra w toku.",

  "lobby.waiting": "Czekamy na załogę...",
  "lobby.ready": "Gotowy",
  "lobby.notReady": "Niegotowy",
  "lobby.start": "Odjazd!",
  "lobby.players": "Gracze",
  "lobby.difficulty": "Poziom trudności",
  "lobby.easy": "Łatwy",
  "lobby.normal": "Normalny",
  "lobby.hard": "Trudny",
  "lobby.levels": "Liczba poziomów",
  "lobby.language": "Język",
  "lobby.avatarName": "Twój konduktor",
  "lobby.readyBtn": "Gotowy!",
  "lobby.unreadyBtn": "Jednak nie",
  "lobby.hostBadge": "Szef stacji",
  "lobby.joinedToast": "{name} wsiada do pociągu!",
  "lobby.startHint": "Gdy wszyscy gotowi — szef stacji daje odjazd!",

  "avatar.0": "Klasyk",
  "avatar.1": "Parowy",
  "avatar.2": "Sygnalista",
  "avatar.3": "Babcia Konduktorowa",
  "avatar.4": "Blaszak",
  "avatar.5": "Kot Bileter",

  "pad.throttle": "Przepustnica",
  "pad.horn": "Gwizdek",
  "pad.switches": "Zwrotnice",
  "pad.speed": "Prędkość",
  "pad.yourTrain": "Twój pociąg",
  "pad.waitStart": "Czekaj na odjazd...",
  "pad.rotate": "Obróć telefon poziomo 📱↻",
  "pad.pausedTitle": "Pauza",
  "pad.pausedSub": "Szef stacji wstrzymał grę",
  "pad.disconnectedTitle": "Utracono połączenie",
  "pad.disconnectedSub": "Próbuję połączyć ponownie...",
  "pad.levelFail": "Katastrofa!",
  "pad.waitHost": "Czekaj na szefa stacji...",

  "host.menu": "Menu szefa",
  "host.pause": "Pauza",
  "host.resume": "Wznów",
  "host.endGame": "Zakończ grę",
  "host.kick": "Wyrzuć",
  "host.confirmEnd": "Zakończyć grę dla wszystkich?",
  "host.confirmKick": "Wyrzucić gracza {name}?",

  "hud.level": "Poziom {n}",
  "hud.delivered": "Dostarczeni: {n}/{goal}",
  "hud.timeLeft": "Czas: {t}",
  "hud.getReady": "Przygotuj się!",
  "hud.go": "JAZDA!",
  "hud.warning": "UWAGA! Kolizja!",

  "level.1.name": "Łąkowo Główne",
  "level.2.name": "Owcze Rozdroża",
  "level.3.name": "Mostek Panika",
  "level.4.name": "Tunel Strachu",
  "level.5.name": "Węzeł Gordyjski",

  "result.winTitle": "Poziom zaliczony! 🎉",
  "result.failCrash": "KATASTROFA! 💥",
  "result.failTime": "Czas minął! ⏰",
  "result.retry": "Jeszcze raz",
  "result.next": "Następny poziom",
  "result.passengers": "Pasażerowie: {n}",
  "result.time": "Czas: {t}",
  "result.attempt": "Podejście {n}",
  "result.crashSub": "Skład rozbity — spróbujcie jeszcze raz!",
  "result.hostContinue": "Szef stacji dotyka ekranu, by grać dalej",

  "results.title": "Koniec trasy!",
  "results.hostContinue": "Szef stacji wybiera co dalej",
  "results.delivered": "Dostarczeni pasażerowie",
  "results.attempts": "Podejścia",
  "results.bestTime": "Najlepszy czas poziomu",
  "results.playAgain": "Gramy jeszcze raz",
  "results.backToMenu": "Powrót do menu",
  "results.stats": "Statystyki drużyny",

  "toast.playerJoined": "{name} dołącza do gry",
  "toast.playerLeft": "{name} opuszcza grę",
  "toast.playerDisconnected": "{name} stracił połączenie",
  "toast.playerReconnected": "{name} wraca do gry",
  "toast.autopilot": "Pociąg gracza {name} jedzie na autopilocie",

  "common.ok": "OK",
  "common.cancel": "Anuluj",
  "common.back": "Wstecz",
  "common.close": "Zamknij",
};

const EN = {
  "connect.title": "Grand Conductors",
  "connect.sub": "All aboard! First to scan becomes the station master 🚂",
  "connect.scanHint": "Scan the QR code with your phone",
  "connect.orCode": "or type the code on your phone",
  "connect.subtitle": "All aboard! First to scan becomes the station master 🚂",
  "connect.hint": "Scan the QR code with your phone or type the code below",

  "join.codePrompt": "Enter room code",
  "join.nickPrompt": "What's your name, conductor?",
  "join.nickPlaceholder": "Your nickname",
  "join.joinBtn": "All aboard!",
  "join.errBadCode": "No such room. Check the code!",
  "join.errFull": "Train is full — all seats taken.",
  "join.errStarted": "The train already left! Game in progress.",

  "lobby.waiting": "Waiting for the crew...",
  "lobby.ready": "Ready",
  "lobby.notReady": "Not ready",
  "lobby.start": "Departure!",
  "lobby.players": "Players",
  "lobby.difficulty": "Difficulty",
  "lobby.easy": "Easy",
  "lobby.normal": "Normal",
  "lobby.hard": "Hard",
  "lobby.levels": "Number of levels",
  "lobby.language": "Language",
  "lobby.avatarName": "Your conductor",
  "lobby.readyBtn": "Ready!",
  "lobby.unreadyBtn": "Not yet",
  "lobby.hostBadge": "Station master",
  "lobby.joinedToast": "{name} hops on the train!",
  "lobby.startHint": "When everyone's ready — the station master departs!",

  "avatar.0": "The Classic",
  "avatar.1": "Steamer",
  "avatar.2": "Signalman",
  "avatar.3": "Granny Conductor",
  "avatar.4": "Tinbot",
  "avatar.5": "Ticket Cat",

  "pad.throttle": "Throttle",
  "pad.horn": "Horn",
  "pad.switches": "Switches",
  "pad.speed": "Speed",
  "pad.yourTrain": "Your train",
  "pad.waitStart": "Waiting for departure...",
  "pad.rotate": "Rotate your phone sideways 📱↻",
  "pad.pausedTitle": "Paused",
  "pad.pausedSub": "The station master paused the game",
  "pad.disconnectedTitle": "Connection lost",
  "pad.disconnectedSub": "Trying to reconnect...",
  "pad.levelFail": "Crash!",
  "pad.waitHost": "Waiting for the station master...",

  "host.menu": "Host menu",
  "host.pause": "Pause",
  "host.resume": "Resume",
  "host.endGame": "End game",
  "host.kick": "Kick",
  "host.confirmEnd": "End the game for everyone?",
  "host.confirmKick": "Kick player {name}?",

  "hud.level": "Level {n}",
  "hud.delivered": "Delivered: {n}/{goal}",
  "hud.timeLeft": "Time: {t}",
  "hud.getReady": "Get ready!",
  "hud.go": "GO!",
  "hud.warning": "WARNING! Collision!",

  "level.1.name": "Meadowville Central",
  "level.2.name": "Sheep Crossing Junction",
  "level.3.name": "Panic Bridge",
  "level.4.name": "Tunnel of Doom",
  "level.5.name": "The Gordian Knot",

  "result.winTitle": "Level cleared! 🎉",
  "result.failCrash": "CATASTROPHE! 💥",
  "result.failTime": "Time's up! ⏰",
  "result.retry": "Try again",
  "result.next": "Next level",
  "result.passengers": "Passengers: {n}",
  "result.time": "Time: {t}",
  "result.attempt": "Attempt {n}",
  "result.crashSub": "Train wrecked — give it another go!",
  "result.hostContinue": "Station master taps the screen to continue",

  "results.title": "End of the line!",
  "results.hostContinue": "The station master picks what's next",
  "results.delivered": "Passengers delivered",
  "results.attempts": "Attempts",
  "results.bestTime": "Best level time",
  "results.playAgain": "Play again",
  "results.backToMenu": "Back to menu",
  "results.stats": "Team stats",

  "toast.playerJoined": "{name} joins the game",
  "toast.playerLeft": "{name} leaves the game",
  "toast.playerDisconnected": "{name} lost connection",
  "toast.playerReconnected": "{name} is back in the game",
  "toast.autopilot": "{name}'s train is running on autopilot",

  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.close": "Close",
};

const DICTS = { pl: PL, en: EN };

let lang = "pl";
try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved && DICTS[saved]) lang = saved;
} catch (e) {}

export function setLang(l) {
  if (!DICTS[l]) return;
  lang = l;
  try { localStorage.setItem(STORE_KEY, l); } catch (e) {}
}

export function getLang() {
  return lang;
}

export function t(key, vars) {
  let s = DICTS[lang][key] ?? DICTS.pl[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replaceAll("{" + k + "}", String(vars[k]));
    }
  }
  return s;
}

export function keysCount() {
  const pl = Object.keys(PL);
  const en = Object.keys(EN);
  return { pl: pl.length, en: en.length, symmetric: pl.length === en.length && pl.every((k) => k in EN) };
}
