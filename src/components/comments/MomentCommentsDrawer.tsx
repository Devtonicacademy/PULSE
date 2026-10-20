import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { X, MessageCircle, Send, ChevronDown } from 'lucide-react';
import { Comment } from '../../types/pulse';
import { CommentItem } from './CommentItem';
import { announceTyping, stopTyping, subscribeTyping } from '../../services/typingService';
import { TypingTracker, typingLabel } from '../../services/typingPresence';

interface MomentCommentsDrawerProps {
  momentId: string | null;
  onClose: () => void;
}
import { ResponsiveSheet, useRetained } from '../ui/ResponsiveSheet';

/** Threads with more replies than this start collapsed to the latest few */
const COLLAPSED_REPLIES = 2;

const CommentsContent: React.FC<MomentCommentsDrawerProps> = ({
  momentId,
  onClose
}) => {
  const {
    moments,
    comments,
    addComment,
    toggleCommentLike,
    userProfile,
    currentUser,
    setDiscussionMomentId,
    discussionStatus,
    setIsAuthModalOpen
  } = usePulse();
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

  // Open this moment's live feed while the drawer is showing it
  useEffect(() => {
    setDiscussionMomentId(momentId);
    return () => setDiscussionMomentId(null);
  }, [momentId, setDiscussionMomentId]);

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
  const shared = discussionStatus !== 'local';
  // Shared threads take comments from accounts (anonymous guests included); a local-only guest
  // would post into the void, so they are asked to join first
  const mustSignIn = shared && !currentUser;
  const canPost = !mustSignIn && discussionStatus !== 'offline';

  // Group top-level comments and replies
  const topLevel = momentComments.filter((c) => !c.parentId);
  const getReplies = (parentId: string) => momentComments.filter((c) => c.parentId === parentId);

  const clearReply = () => {
    setReplyToId(null);
    setReplyToUser(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !canPost) return;

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
    <>
      <header className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Discussion</h2>
          <p className="text-xs text-slate-400 truncate">{currentMoment ? currentMoment.title : 'Moment thread'}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close discussion"
          className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Where this thread lives: shared and live, or just on this device */}
      <div
        className="px-4 py-2 text-xs text-slate-300 flex items-center gap-2 shrink-0 border-b border-white/10 bg-white/5"
        role="status"
        data-testid="discussion-status"
        data-status={discussionStatus}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            discussionStatus === 'live'
              ? 'bg-emerald-400'
              : discussionStatus === 'offline'
                ? 'bg-rose-400'
                : discussionStatus === 'connecting'
                  ? 'bg-amber-400'
                  : 'bg-slate-400'
          }`}
        />
        <span>
          {discussionStatus === 'live' && 'Live. New comments appear instantly.'}
          {discussionStatus === 'connecting' && 'Connecting…'}
          {discussionStatus === 'offline' && "Can't reach the discussion. Reopen to retry."}
          {discussionStatus === 'local' && 'Demo moment. Comments stay on this device.'}
        </span>
      </div>

      {/* Comments */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {topLevel.length === 0 ? (
          <div className="text-center py-14">
            <MessageCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-white">No comments yet</p>
            <p className="text-sm text-slate-400 mt-1">Start the conversation.</p>
          </div>
        ) : (
          topLevel.map((c) => {
            const replies = getReplies(c.id);
            const collapsible = replies.length > COLLAPSED_REPLIES;
            const expanded = !collapsible || expandedThreads.has(c.id);
            const visibleReplies = expanded ? replies : replies.slice(-COLLAPSED_REPLIES);
            const hiddenCount = replies.length - visibleReplies.length;

            return (
              <div key={c.id} className="space-y-3">
                <CommentItem comment={c} onLike={toggleCommentLike} onReply={startReply} />

                {replies.length > 0 && (
                  <div className="ml-4 pl-4 space-y-3 border-l border-white/10">
                    {collapsible && (
                      <button
                        type="button"
                        onClick={() => toggleThread(c.id)}
                        aria-expanded={expanded}
                        className="flex items-center gap-1 py-1 text-xs text-slate-300 hover:text-white transition-colors"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        {expanded ? 'Hide earlier replies' : `View ${hiddenCount} earlier ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                      </button>
                    )}
                    {visibleReplies.map((reply) => (
                      <CommentItem key={reply.id} comment={reply} isReply onLike={toggleCommentLike} onReply={startReply} />
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
      <div className="h-6 px-4 shrink-0 flex items-center gap-1.5 text-xs text-slate-400" aria-live="polite" data-testid="typing-indicator">
        {typists.length > 0 && (
          <>
            <span className="flex items-end gap-0.5 h-2" aria-hidden>
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="w-1 h-1 rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
            <span>{typingLabel(typists.map((t) => t.userName))}</span>
          </>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {mustSignIn && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-md bg-white/5 border border-white/10 text-sm text-slate-200">
            <span>Sign in to join this discussion.</span>
            <button type="button" onClick={() => setIsAuthModalOpen(true)} className="px-3 py-1.5 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium">
              Sign in
            </button>
          </div>
        )}
        {replyToUser && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300">
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
            disabled={!canPost}
            aria-label="Write a comment"
            placeholder={`Comment as @${userProfile.username}`}
            className="flex-1 px-3.5 py-2.5 rounded-md bg-white/5 border border-white/10 text-base sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-white/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!content.trim() || !canPost}
            aria-label="Send comment"
            className="p-2.5 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-40 text-white transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </>
  );
};

export const MomentCommentsDrawer: React.FC<MomentCommentsDrawerProps> = ({ momentId, onClose }) => {
  const retained = useRetained(momentId);
  return (
    <ResponsiveSheet open={!!momentId} onClose={onClose} label="Live discussion" size="lg" scroll={false} className="h-[80dvh]">
      {retained && <CommentsContent momentId={retained} onClose={onClose} />}
    </ResponsiveSheet>
  );
};
