/**
 * Kipple's motion kit (the "kipple-welcome" design handoff, MOTION.md): React Bits components with the
 * settings from the design, plus small motion-based stand-ins where the React Bits component
 * needs GSAP or brings its own look (AnimatedContent, AnimatedList, BounceCards, Stepper).
 *
 * Everything here is static under `prefers-reduced-motion: reduce`: elements are simply in place.
 */
import { Children, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import BlurText from "./bits/BlurText";
import ClickSpark from "./bits/ClickSpark";
import SquishSwitch from "./bits/SquishSwitch";
import SpringCheck from "./bits/SpringCheck";
import StatusMark from "./bits/StatusMark";
import HoldButton from "./bits/HoldButton";
import SwipeToast from "./bits/SwipeToast";
import { useThemePref } from "../lib/theme";
import "../motion.css";

/** The curves and timings from MOTION.md, for motion's `transition`. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;
export const DURATION = { micro: 0.18, ui: 0.4, enter: 0.7 } as const;
export const STAGGER = 0.08;

/** True when the OS asks for less motion. */
export function useCalm(): boolean {
  return !!useReducedMotion();
}

/** The value of a colour token, for components that paint on a canvas. Follows the theme. */
function useToken(name: string, fallback: string): string {
  const theme = useThemePref();
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    // The theme attribute is set right before this effect runs; read it on the next frame to be safe.
    const id = requestAnimationFrame(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      setValue(v || fallback);
    });
    return () => cancelAnimationFrame(id);
  }, [name, fallback, theme]);
  return value;
}

/** Screen title: BlurText by words from the top, 80 ms apart, steps of .35 s. */
export function Title({ text, className }: { text: string; className?: string }) {
  const calm = useCalm();
  if (calm) return <>{text}</>;
  // Keyed by the text so a language switch plays it again instead of mixing old and new words.
  return <BlurText key={text} text={text} className={className} animateBy="words" direction="top" delay={80} stepDuration={0.35} distance={18} trigger="load" />;
}

/**
 * AnimatedContent (on motion): a block rises 18px and fades in over .8 s. Children of a
 * `stagger` Reveal come in one after another, 80 ms apart.
 */
export function Reveal(props: { children: ReactNode; delay?: number; stagger?: boolean; className?: string; style?: CSSProperties; as?: "div" | "section" }) {
  const calm = useCalm();
  const { delay = 0 } = props;
  const items = props.stagger ? Children.toArray(props.children) : [props.children];
  const Tag = props.as === "section" ? motion.section : motion.div;
  if (props.stagger)
    return (
      <>
        {items.map((child, i) => (
          <motion.div
            key={i}
            className={props.className}
            style={props.style}
            initial={calm ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: delay + i * STAGGER }}
          >
            {child}
          </motion.div>
        ))}
      </>
    );
  return (
    <Tag
      className={props.className}
      style={props.style}
      initial={calm ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
    >
      {props.children}
    </Tag>
  );
}

/**
 * AnimatedList (Kipple variant): list items rise 14px from below with scale .96, 60 ms apart.
 * `play` restarts the entrance, e.g. when the list's screen slides in.
 */
export function RiseList(props: { children: ReactNode; className?: string; delay?: number; play?: unknown }) {
  const calm = useCalm();
  const items = Children.toArray(props.children);
  return (
    <ol className={props.className} key={String(props.play ?? "")}>
      {items.map((child, i) => (
        <motion.li
          key={i}
          initial={calm ? false : { opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: (props.delay ?? 0) + i * 0.06 }}
        >
          {child}
        </motion.li>
      ))}
    </ol>
  );
}

/** ClickSpark: 8 sparks, radius 36, 550 ms, in the accent colour and its light coral. */
export function Spark(props: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const calm = useCalm();
  const accent = useToken("--accent", "#d9573b");
  if (calm) return <>{props.children}</>;
  return (
    <ClickSpark className={props.className} style={{ width: "auto", height: "auto", ...props.style }} sparkColor={[accent, "#F2A58F"]} sparkCount={8} sparkRadius={36} duration={550}>
      {props.children}
    </ClickSpark>
  );
}

/** SquishSwitch, 44×26: accent track when on, 22% ink when off, panel-coloured thumb. */
export function Switch(props: { checked: boolean; onChange: (on: boolean) => void; label?: string; disabled?: boolean; id?: string }) {
  return (
    <SquishSwitch
      id={props.id}
      checked={props.checked}
      onChange={props.onChange}
      ariaLabel={props.label}
      disabled={props.disabled}
      width={44}
      height={26}
      radius={13}
      stretch={36}
      trackColor="var(--switch-off)"
      trackOnColor="var(--accent)"
      thumbColor="var(--panel)"
      thumbOnColor="var(--panel)"
      className="k-switch"
    />
  );
}

/** SpringCheck in the accent colour. */
export function Check(props: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <SpringCheck
      checked={props.checked}
      onChange={props.onChange}
      label={props.label}
      disabled={props.disabled}
      color="var(--ink)"
      fillColor="var(--accent)"
      checkColor="var(--on-accent, #fff)"
      boxSize={18}
      boxRadius={5}
      fontSize={14}
      strike="none"
      doneOpacity={1}
      className="k-check"
    />
  );
}

/** StatusMark for «Сохранён», «Вход выполнен»: a check drawn in the ok colour. */
export function Done(props: { label: ReactNode; className?: string }) {
  return <StatusMark status="done" label={props.label} color="var(--ok)" doneColor="var(--ok)" size={16} fontSize={13} strike={false} className={`k-status ${props.className ?? ""}`} />;
}

/** HoldButton for irreversible actions: hold 1.6 s, fills with the danger colour. */
export function HoldToConfirm(props: { children: ReactNode; doneLabel: ReactNode; onHold: () => void; disabled?: boolean }) {
  return (
    <HoldButton
      onHold={props.onHold}
      doneLabel={props.doneLabel}
      disabled={props.disabled}
      holdTime={1600}
      size="sm"
      radius={8}
      backgroundColor="var(--panel)"
      textColor="var(--danger)"
      fillColor="var(--danger)"
      fillTextColor="var(--on-accent, #fff)"
      wave={false}
      glow={false}
      className="k-hold"
    >
      {props.children}
    </HoldButton>
  );
}

/**
 * SwipeToast: ink background, bg-coloured text, swiped away sideways. The caller decides how long
 * it stays (`text` back to null closes it with the animation).
 */
/** A notice, with an optional button that does something about it. */
export interface ToastMsg {
  text: string;
  action?: { label: string; run: () => void };
}

export function Toast(props: { text: string | null; action?: ToastMsg["action"]; onClose: () => void }) {
  const calm = useCalm();
  const [shown, setShown] = useState(props.text);
  const [action, setAction] = useState(props.action);
  useEffect(() => {
    if (props.text) {
      setShown(props.text);
      setAction(props.action);
    }
  }, [props.text, props.action]);
  if (!shown) return null;
  return (
    <div className="k-toast">
      <SwipeToast
        key={shown}
        open={!!props.text}
        title={shown}
        actionLabel={action?.label}
        onAction={action?.run}
        inline
        background="var(--ink)"
        color="var(--bg)"
        fuse="none"
        duration={0}
        closeButton={false}
        width={420}
        radius={12}
        slideMs={calm ? 1 : 400}
        onClose={() => (setShown(null), props.onClose())}
      />
    </div>
  );
}

/** Stepper (indicator only): bars fill with the accent from left to right. */
export function StepBar(props: { on: boolean }) {
  const calm = useCalm();
  const t: Transition = calm ? { duration: 0 } : { duration: DURATION.ui, ease: EASE_OUT };
  return (
    <i className="k-stepbar">
      <motion.b initial={false} animate={{ scaleX: props.on ? 1 : 0 }} transition={t} />
    </i>
  );
}

/** BounceCards' entrance for the collage: each card pops in with a spring, 60 ms apart. */
export function BounceIn(props: { index: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const calm = useCalm();
  return (
    <motion.div
      className={props.className}
      style={props.style}
      initial={calm ? false : { opacity: 0, scale: 0.6, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0.6, visualDuration: 0.5, delay: 0.25 + props.index * 0.06, opacity: { duration: 0.2, delay: 0.25 + props.index * 0.06 } }}
    >
      {props.children}
    </motion.div>
  );
}
