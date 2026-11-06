/**
 * Place search as an accessible combobox: type, move with the arrow keys, Enter to pick.
 * With an empty box it offers saved places.
 */
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, MapPin, Search as SearchIcon, Star, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { messageFor } from "../api/http";
import { searchPlaces } from "../api/places";
import { placeKey, placeSubtitle, type Place } from "../lib/types";
import { usePlaces } from "../state/places";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Search({ id = "place-search" }: { id?: string }) {
  const { setPlace, saved } = usePlaces();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const term = useDebounced(text.trim(), 250);

  const results = useQuery({
    queryKey: ["search", term.toLowerCase()],
    queryFn: ({ signal }) => searchPlaces(term, signal),
    enabled: term.length >= 2,
    staleTime: 60 * 60_000,
  });

  const showingSaved = text.trim().length < 2;
  const options: Place[] = showingSaved ? saved : results.data ?? [];

  useEffect(() => setActive(0), [term, showingSaved]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const choose = (place: Place) => {
    setPlace({ ...place, source: "search" });
    setText("");
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      if (options[active]) {
        event.preventDefault();
        choose(options[active]);
      }
    } else if (event.key === "Escape") {
      if (text) setText("");
      else setOpen(false);
    }
  };

  const listVisible = open && (options.length > 0 || (!showingSaved && term.length >= 2));
  const optionId = (i: number) => `${listId}-option-${i}`;
  let status: string | null = null;
  if (!showingSaved && term.length >= 2) {
    if (results.isError) status = messageFor(results.error);
    else if (results.isFetching && !results.data) status = "Searching…";
    else if (results.data && results.data.length === 0) status = `No places match “${term}”. Check the spelling or try a nearby town.`;
  }

  return (
    <div className="search" ref={root}>
      <label htmlFor={id} className="visually-hidden">
        Search for a place
      </label>
      <SearchIcon className="search-icon" size={18} aria-hidden="true" />
      <input
        ref={input}
        id={id}
        className="search-input"
        type="search"
        placeholder="Search a city or town"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listId}
        aria-activedescendant={listVisible && options[active] ? optionId(active) : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {results.isFetching && !showingSaved && <LoaderCircle className="search-spinner" size={16} aria-hidden="true" />}
      {text && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => (setText(""), input.current?.focus())}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
      {listVisible && (
        <div className="search-panel">
          {showingSaved && <p className="search-heading">Saved places</p>}
          <ul id={listId} role="listbox" aria-label={showingSaved ? "Saved places" : "Places found"} className="search-list">
            {options.map((place, i) => (
              <li
                key={`${placeKey(place)}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className="search-option"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
                onPointerMove={() => setActive(i)}
              >
                {showingSaved ? <Star size={16} aria-hidden="true" className="search-option-icon" /> : <MapPin size={16} aria-hidden="true" className="search-option-icon" />}
                <span>
                  <span className="search-option-name">{place.name}</span>
                  <span className="search-option-detail">{placeSubtitle(place)}</span>
                </span>
              </li>
            ))}
          </ul>
          {status && (
            <p className="search-status" role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
