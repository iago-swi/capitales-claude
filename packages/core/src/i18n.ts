import type { Lang, Localized } from './types.js';

/**
 * Every string the interface shows, in every language.
 *
 * A flat record rather than a library: there are two languages and about twenty
 * keys, so an i18n framework would be more machinery than message. Typing
 * MESSAGES as Localized<Record<MessageKey, string>> makes a missing French
 * translation a compile error rather than a blank label.
 */
export type MessageKey =
  | 'loading'
  | 'cannotStart'
  | 'language'
  | 'question'
  | 'points'
  | 'score'
  | 'streak'
  | 'seconds'
  | 'timeUp'
  | 'runOver'
  | 'correctOf'
  | 'bestStreak'
  | 'newHighScore'
  | 'enterName'
  | 'nameLabel'
  | 'saveScore'
  | 'saving'
  | 'couldNotSave'
  | 'retry'
  | 'notAHighScore'
  | 'highScores'
  | 'noScoresYet'
  | 'playAgain'
  | 'whichCapital';

export const MESSAGES: Localized<Record<MessageKey, string>> = {
  en: {
    loading: 'Loading…',
    cannotStart: 'Cannot start',
    language: 'Language',
    question: 'Question',
    points: 'points',
    score: 'Score',
    streak: 'Streak',
    seconds: 's',
    timeUp: 'Time up',
    runOver: 'Run over',
    correctOf: 'correct out of',
    bestStreak: 'best streak',
    newHighScore: 'New high score!',
    enterName: 'You made the top 10. Enter your name:',
    nameLabel: 'Name',
    saveScore: 'Save score',
    saving: 'Saving…',
    couldNotSave: 'Could not save your score',
    retry: 'Try again',
    notAHighScore: 'Not a top 10 score this time.',
    highScores: 'High scores',
    noScoresYet: 'No scores yet.',
    playAgain: 'Play again',
    whichCapital: 'Which city is the capital?',
  },
  fr: {
    loading: 'Chargement…',
    cannotStart: 'Démarrage impossible',
    language: 'Langue',
    question: 'Question',
    points: 'points',
    score: 'Score',
    streak: 'Série',
    seconds: 's',
    timeUp: 'Temps écoulé',
    runOver: 'Partie terminée',
    correctOf: 'bonnes réponses sur',
    bestStreak: 'meilleure série',
    newHighScore: 'Nouveau record !',
    enterName: 'Vous entrez dans le top 10. Entrez votre nom :',
    nameLabel: 'Nom',
    saveScore: 'Enregistrer',
    saving: 'Enregistrement…',
    couldNotSave: 'Impossible d’enregistrer votre score',
    retry: 'Réessayer',
    notAHighScore: 'Pas dans le top 10 cette fois.',
    highScores: 'Meilleurs scores',
    noScoresYet: 'Aucun score pour l’instant.',
    playAgain: 'Rejouer',
    whichCapital: 'Quelle ville est la capitale ?',
  },
};

/** Looks up one interface string. */
export function t(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key];
}

/** Flag shown on the language toggle. */
export const LANG_FLAG: Localized<string> = { en: '🇬🇧', fr: '🇫🇷' };

/** Full language name, shown in the toggle's accessible label. */
export const LANG_NAME: Localized<string> = { en: 'English', fr: 'Français' };
