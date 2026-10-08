import React from 'react';
import { Heart, CornerDownRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Comment } from '../../types/pulse';

interface CommentItemProps {
  comment: Comment;
  /** Replies share the exact same layout as top-level comments, just indented by their thread */
  isReply?: boolean;
  onLike: (commentId: string) => void;
  /** Replying to a reply continues the same thread */
  onReply: (comment: Comment) => void;
}

/** One comment, top-level or reply: same bubble, same actions, same type scale */
export const CommentItem: React.FC<CommentItemProps> = ({ comment, isReply = false, onLike, onReply }) => (
  <article
    className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-white/10"
    aria-label={`${isReply ? 'Reply' : 'Comment'} by ${comment.userName}`}
  >
    <img
      src={comment.userAvatar}
      alt=""
      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
    />
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-bold text-slate-100 truncate">@{comment.userName}</span>
        <time
          dateTime={comment.createdAt}
          className="text-[10px] text-slate-400 shrink-0"
        >
          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
        </time>
      </div>
      <p className="text-xs text-slate-200 leading-relaxed break-words">{comment.content}</p>

      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-300">
        <button
          type="button"
          onClick={() => onLike(comment.id)}
          aria-pressed={comment.userLiked}
          className={`flex items-center gap-1 hover:text-accent-300 transition-colors ${
            comment.userLiked ? 'text-accent-300 font-bold' : ''
          }`}
        >
          <Heart className={`w-3 h-3 ${comment.userLiked ? 'fill-current' : ''}`} />
          <span>{comment.likesCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onReply(comment)}
          className="flex items-center gap-1 hover:text-signal-300 transition-colors"
        >
          <CornerDownRight className="w-3 h-3" />
          <span>Reply</span>
        </button>
      </div>
    </div>
  </article>
);
