import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { X, MessageCircle, Send, Sparkles, ChevronDown } from 'lucide-react';
import { Comment } from '../../types/pulse';
import { CommentItem } from './CommentItem';
import { announceTyping, stopTyping, subscribeTyping } from '../../services/typingService';
import { TypingTracker, typingLabel } from '../../services/typingPresence';

interface MomentCommentsDrawerProps {
  momentId: string | null;
  onClose: () => void;
}

/** Threads with more replies than this start collapsed to the latest few */
const COLLAPSED_REPLIES = 2;

export const MomentCommentsDrawer: React.FC<MomentCommentsDrawerProps> = ({
  momentId,
  onClose
}) => {
  const { moments, comments, addComment, toggleCommentLike, userProfile } = usePulse();
  const [content, setContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToUser, setReplyToUser] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [typists, setTypists] = useState<{ userId: string; userName: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const me = useMemo(
    () => ({ id: userProfile.id, name: userProfile.username }),
    [userProfile.id, userProfile.username]
  );

  // Who else is typing here. The tracker works from when each record last changed, and a timer
  // re-checks so a typist who goes quiet disappears without another event arriving.
  useEffect(() => {
    if (!momentId) return;
    const tracker = new TypingTracker();
    const refresh = () => {
      const active = tracker.active(me.id, Date.now());
      setTypists((prev) =>
        prev.length === active.length && prev.every((p, i) => p.userId === active[i].userId) ? prev : active
      );
    };
    const unsubscribe = subscribeTyping(momentId, (entries) => {
      tracker.observe(entries, Date.now());
      refresh();
    });
    const timer = window.setInterval(refresh, 1000);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      stopTyping(momentId, me);
      setTypists([]);
    };
  }, [momentId, me]);

  const momentComments = useMemo(
    () => (momentId ? comments.filter((c) => c.momentId === momentId) : []),
    [comments, momentId]
  );

  // Keep the newest comment in view
  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [momentComments.length]);

  if (!momentId) return null;

  const currentMoment = moments.find((m) => m.id === momentId);

  // Group top-level comments and replies
  const topLevel = momentComments.filter((c) => !c.parentId);
  const getReplies = (parentId: string) => momentComments.filter((c) => c.parentId === parentId);

  const clearReply = () => {
    setReplyToId(null);
    setReplyToUser(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    addComment(momentId, content.trim(), replyToId || undefined);
    stopTyping(momentId, me);
    setContent('');
    clearReply();
  };

  // Replies always attach to the thread's top-level comment, so replying to a reply continues the thread
  const startReply = (target: Comment) => {
    const threadId = target.parentId ?? target.id;
    setReplyToId(threadId);
    setReplyToUser(target.userName);
    setContent(`@${target.userName} `);
    setExpandedThreads((prev) => new Set(prev).add(threadId));
    inputRef.current?.focus();
  };

  const handleChange = (value: string) => {
    setContent(value);
    // Typing only counts for real text (the pre-filled @mention alone is not typing)
    const typed = value.trim().length > 0 && value.trim() !== (replyToUser ? `@${replyToUser}` : '');
    if (typed) announceTyping(momentId, me);
    else stopTyping(momentId, me);
  };

  const toggleThread = (id: string) =>
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        role="dialog"
        aria-label="Live discussion"
        className="w-full sm:max-w-lg h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-panel border border-white/10 shadow-2xl text-white animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-signal-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Live Discussion</h3>
              <p className="text-[11px] text-slate-300 truncate max-w-[240px]">
                {currentMoment ? currentMoment.title : 'Moment thread'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close discussion"
            className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comments Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {topLevel.length === 0 ? (
            <div className="text-center py-12 text-slate-300 text-xs">
              <Sparkles className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-200">No comments yet</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Be the first to share an update or ask a question!
              </p>
            </div>
          ) : (
            topLevel.map((c) => {
              const replies = getReplies(c.id);
              const collapsible = replies.length > COLLAPSED_REPLIES;
              const expanded = !collapsible || expandedThreads.has(c.id);
              const visibleReplies = expanded ? replies : replies.slice(-COLLAPSED_REPLIES);
              const hiddenCount = replies.length - visibleReplies.length;

              return (
                <div key={c.id} className="space-y-2">
                  <CommentItem comment={c} onLike={toggleCommentLike} onReply={startReply} />

                  {replies.length > 0 && (
                    <div className="ml-4 pl-4 space-y-2 border-l-2 border-white/15">
                      {collapsible && (
                        <button
                          type="button"
                          onClick={() => toggleThread(c.id)}
                          aria-expanded={expanded}
                          className="flex items-center gap-1 text-[11px] font-semibold text-signal-300 hover:text-signal-200 transition-colors"
                        >
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                          {expanded
                            ? 'Hide earlier replies'
                            : `View ${hiddenCount} earlier ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                        </button>
                      )}
                      {visibleReplies.map((reply) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          isReply
                          onLike={toggleCommentLike}
                          onReply={startReply}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        {/* Typing indicator: reserves its line so the list does not jump when it appears */}
        <div
          className="h-5 px-4 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-300"
          aria-live="polite"
          data-testid="typing-indicator"
        >
          {typists.length > 0 && (
            <>
              <span className="flex items-end gap-0.5 h-2" aria-hidden>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1 h-1 rounded-full bg-signal-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              <span>{typingLabel(typists.map((t) => t.userName))}</span>
            </>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-white/10 glass-panel shrink-0">
          {replyToUser && (
            <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-lg bg-slate-800 text-[11px] text-signal-300">
              <span>Replying to @{replyToUser}</span>
              <button
                type="button"
                onClick={() => {
                  clearReply();
                  setContent('');
                  stopTyping(momentId, me);
                }}
                className="text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={() => stopTyping(momentId, me)}
              maxLength={1000}
              aria-label="Write a comment"
              placeholder={`Comment as @${userProfile.username}...`}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-signal-500"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              aria-label="Send comment"
              className="p-2.5 rounded-xl bg-signal-500 hover:bg-signal-600 disabled:opacity-40 text-slate-950 font-bold transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
