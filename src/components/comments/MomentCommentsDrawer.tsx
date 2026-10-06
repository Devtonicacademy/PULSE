import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import {
  X,
  MessageCircle,
  Send,
  Heart,
  CornerDownRight,
  Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MomentCommentsDrawerProps {
  momentId: string | null;
  onClose: () => void;
}

export const MomentCommentsDrawer: React.FC<MomentCommentsDrawerProps> = ({
  momentId,
  onClose
}) => {
  const { moments, comments, addComment, toggleCommentLike, userProfile } = usePulse();
  const [content, setContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToUser, setReplyToUser] = useState<string | null>(null);

  if (!momentId) return null;

  const currentMoment = moments.find((m) => m.id === momentId);
  const momentComments = comments.filter((c) => c.momentId === momentId);

  // Group top-level comments and replies
  const topLevel = momentComments.filter((c) => !c.parentId);
  const getReplies = (parentId: string) =>
    momentComments.filter((c) => c.parentId === parentId);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    addComment(momentId, content.trim(), replyToId || undefined);
    setContent('');
    setReplyToId(null);
    setReplyToUser(null);
  };

  const startReply = (commentId: string, author: string) => {
    setReplyToId(commentId);
    setReplyToUser(author);
    setContent(`@${author} `);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="w-full sm:max-w-lg h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-panel border border-white/10 shadow-2xl text-white animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Live Discussion</h3>
              <p className="text-[10px] text-slate-400 truncate max-w-[240px]">
                {currentMoment ? currentMoment.title : 'Moment thread'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comments Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {topLevel.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">No comments yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Be the first to share an update or ask a question!
              </p>
            </div>
          ) : (
            topLevel.map((c) => {
              const replies = getReplies(c.id);

              return (
                <div key={c.id} className="space-y-2">
                  {/* Top level comment item */}
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
                    <img
                      src={c.userAvatar}
                      alt={c.userName}
                      className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200">
                          @{c.userName}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed break-words">
                        {c.content}
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
                        <button
                          onClick={() => toggleCommentLike(c.id)}
                          className={`flex items-center gap-1 hover:text-rose-400 transition-colors ${
                            c.userLiked ? 'text-rose-400 font-bold' : ''
                          }`}
                        >
                          <Heart className={`w-3 h-3 ${c.userLiked ? 'fill-current' : ''}`} />
                          <span>{c.likesCount}</span>
                        </button>
                        <button
                          onClick={() => startReply(c.id, c.userName)}
                          className="hover:text-cyan-300 transition-colors flex items-center gap-1"
                        >
                          <CornerDownRight className="w-3 h-3" />
                          <span>Reply</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Threaded nested replies */}
                  {replies.length > 0 && (
                    <div className="pl-6 space-y-2 border-l border-white/10 ml-4">
                      {replies.map((reply) => (
                        <div
                          key={reply.id}
                          className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/40 border border-white/5"
                        >
                          <img
                            src={reply.userAvatar}
                            alt={reply.userName}
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-cyan-300">
                                @{reply.userName}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {formatDistanceToNow(new Date(reply.createdAt), {
                                  addSuffix: true
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed break-words">
                              {reply.content}
                            </p>
                            <div className="mt-1 text-[10px] text-slate-400">
                              <button
                                onClick={() => toggleCommentLike(reply.id)}
                                className={`flex items-center gap-1 hover:text-rose-400 transition-colors ${
                                  reply.userLiked ? 'text-rose-400 font-bold' : ''
                                }`}
                              >
                                <Heart
                                  className={`w-3 h-3 ${
                                    reply.userLiked ? 'fill-current' : ''
                                  }`}
                                />
                                <span>{reply.likesCount}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 border-t border-white/10 glass-panel shrink-0"
        >
          {replyToUser && (
            <div className="flex items-center justify-between px-2 py-1 mb-2 rounded bg-slate-800 text-[10px] text-cyan-300">
              <span>Replying to @{replyToUser}</span>
              <button
                type="button"
                onClick={() => {
                  setReplyToId(null);
                  setReplyToUser(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Comment as @${userProfile.username}... Use @ to mention`}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-slate-950 font-bold transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
