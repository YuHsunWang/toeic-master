import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, Volume2, Loader2, ArrowRight, RotateCcw } from 'lucide-react';
import BOOK_STORIES from './data/stories.json';
import NEWS_STORIES from './data/news-stories.json';
import { storyDb } from './db.js';
import { BLANK, validEpisodes, pickNextEpisode, nextWordProgress } from './story.js';

const STORIES = [...BOOK_STORIES, ...NEWS_STORIES];

// Full article text lives in git-ignored news/ and is bundled only for the private build
// (VITE_NEWS_FULLTEXT=1). The public build gets {} and never ships the text.
const ARTICLE_LOADERS =
  import.meta.env.VITE_NEWS_FULLTEXT === '1'
    ? import.meta.glob('../news/articles.json', { import: 'default' })
    : {};

function NewsCard({ news, article, showSummary = false }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 mb-4">
      <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">
        Inspired by {news.source} · {news.date}
      </p>
      <a href={news.url} target="_blank" rel="noreferrer" className="text-sm font-black text-[var(--primary)] underline">
        {news.headline}
      </a>
      {showSummary && news.summary && (
        <p className="mt-2 text-sm font-bold text-[var(--text)] leading-relaxed">{news.summary}</p>
      )}
      {article && (
        <details className="mt-3">
          <summary className="text-xs font-black text-[var(--muted)] cursor-pointer">Read the article</summary>
          <p className="mt-2 text-sm text-[var(--text)] leading-relaxed whitespace-pre-line">{article.text}</p>
        </details>
      )}
    </div>
  );
}

const card = 'bg-[var(--bg)] border border-[var(--border)] rounded-3xl p-6';
const primaryBtn =
  'w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-text)] font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2';

// reveal=false: show only the wrong pick, so the rescue question doesn't give the answer away.
function optionClass(option, answer, picked, done, reveal) {
  if (!done) return 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]';
  if (option === answer && reveal) return 'bg-[var(--surface)] border-[var(--accent)] text-[var(--accent)]';
  if (option === picked) return 'bg-[var(--surface)] border-[var(--danger)] text-[var(--danger)]';
  return 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]';
}

function Options({ options, answer, picked, done, onPick, reveal = true }) {
  return (
    <div className="space-y-3">
      {options.map(option => (
        <button
          key={option}
          onClick={() => onPick(option)}
          disabled={done}
          className={`w-full text-left p-4 rounded-2xl border font-black transition-all ${optionClass(option, answer, picked, done, reveal)}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function StoryPanel({ vocabulary, handleSpeak, currentlySpeaking }) {
  const episodes = useMemo(() => validEpisodes(STORIES, vocabulary ?? []), [vocabulary]);
  const [doneIds, setDoneIds] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null); // first choice
  const [rescuePicked, setRescuePicked] = useState(null);
  const [missed, setMissed] = useState([]);

  const [article, setArticle] = useState(null);

  useEffect(() => {
    storyDb.doneIds().then(setDoneIds);
  }, []);

  useEffect(() => {
    setArticle(null);
    const load = Object.values(ARTICLE_LOADERS)[0];
    if (!episode?.news || !load) return;
    load().then(all => setArticle(all.find(a => a.id === episode.news.id) ?? null));
  }, [episode]);

  const start = () => {
    setEpisode(pickNextEpisode(episodes, vocabulary ?? [], doneIds ?? []));
    setIndex(0);
    setPicked(null);
    setRescuePicked(null);
    setMissed([]);
  };

  if (doneIds === null || !vocabulary) return null;

  if (!episode) {
    const left = episodes.filter(ep => !doneIds.includes(ep.id)).length;
    return (
      <div className={card}>
        <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-3">Story</p>
        <p className="text-sm font-bold text-[var(--text)] mb-5 leading-relaxed">
          You are the new hire at Harbor &amp; Pine Trading. Each episode is one workday. Pick the right word to keep the day on track.
        </p>
        {episodes.length === 0 ? (
          <p className="text-sm font-black text-[var(--muted)]">No stories match your word list yet.</p>
        ) : left > 0 ? (
          <button onClick={start} className={primaryBtn}>
            Start next episode ({left} left) <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={async () => {
              await storyDb.resetDone();
              setDoneIds([]);
            }}
            className={primaryBtn}
          >
            All episodes done — replay <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  const finished = index >= episode.scenes.length;
  if (finished) {
    return (
      <div className={card}>
        <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2">{episode.title}</p>
        <p className="text-lg font-black text-[var(--text)] leading-relaxed mb-5">{episode.ending}</p>
        {episode.news && <NewsCard news={episode.news} article={article} showSummary />}
        {missed.length > 0 && (
          <p className="text-sm font-bold text-[var(--danger)] mb-5">Words to watch: {missed.join(', ')}</p>
        )}
        <button
          onClick={async () => {
            await storyDb.markDone(episode.id);
            setDoneIds(await storyDb.doneIds());
            setEpisode(null);
          }}
          className={primaryBtn}
        >
          End of the day <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const scene = episode.scenes[index];
  const isCall = scene.kind === 'call';
  const firstWrong = picked !== null && picked !== scene.answer;
  const resolved = (picked !== null && !firstWrong) || rescuePicked !== null;
  const speakId = `story-${episode.id}-${index}`;

  const resolve = async firstTry => {
    if (!firstTry) setMissed(m => [...m, scene.word]);
    await storyDb.updateWord(scene.word, r => nextWordProgress(r, firstTry));
  };

  const pick = option => {
    setPicked(option);
    if (option === scene.answer) resolve(true);
  };

  const pickRescue = option => {
    setRescuePicked(option);
    resolve(false);
  };

  const next = () => {
    setIndex(i => i + 1);
    setPicked(null);
    setRescuePicked(null);
  };

  const shownText = !isCall && resolved ? scene.text.replace(BLANK, scene.answer) : scene.text;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest">{episode.title}</p>
        <p className="text-sm font-black text-[var(--primary)]">
          {index + 1} / {episode.scenes.length}
        </p>
      </div>

      {episode.news && index === 0 && <NewsCard news={episode.news} article={null} />}

      <div className={`${card} mb-5`}>
        <p className="text-xs font-bold text-[var(--muted)] mb-3 flex items-center gap-2">
          {isCall ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
          {scene.from} · {scene.setup}
        </p>
        {isCall ? (
          <>
            <button
              onClick={() => handleSpeak(scene.text, speakId)}
              className="px-5 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--primary)] text-[var(--primary)] font-black text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {currentlySpeaking === speakId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
              Answer the call
            </button>
            {resolved && <p className="mt-4 text-lg font-bold text-[var(--text)] leading-relaxed">“{scene.text}”</p>}
            <p className="mt-4 text-sm font-black text-[var(--text)]">{scene.question}</p>
          </>
        ) : (
          <p className="text-xl font-bold text-[var(--text)] leading-relaxed whitespace-pre-line">{shownText}</p>
        )}
      </div>

      <Options options={scene.options} answer={scene.answer} picked={picked} done={picked !== null} reveal={resolved} onPick={pick} />

      {firstWrong && (
        <div className="mt-5 space-y-3">
          <div className={card}>
            <p className="text-xs font-bold text-[var(--danger)] mb-2">{scene.from} replies:</p>
            <p className="text-lg font-bold text-[var(--text)] leading-relaxed">“{scene.rescue.reaction}”</p>
            {isCall && (
              <button
                onClick={() => handleSpeak(scene.rescue.reaction, `${speakId}-r`)}
                className="mt-3 text-[var(--primary)] font-black text-xs uppercase flex items-center gap-2"
              >
                <Volume2 className="w-4 h-4" /> Play
              </button>
            )}
          </div>
          <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest">Try again</p>
          <Options
            options={scene.rescue.options}
            answer={scene.rescue.answer}
            picked={rescuePicked}
            done={rescuePicked !== null}
            onPick={pickRescue}
          />
        </div>
      )}

      {resolved && (
        <button onClick={next} className={`${primaryBtn} mt-5`}>
          {index + 1 >= episode.scenes.length ? 'Finish' : 'Next'} <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
