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

/** One comment, top-level or reply: same layout, same actions, same type scale */
export const CommentItem: React.FC<CommentItemProps> = ({ comment, isReply = false, onLike, onReply }) => (
  <article className="flex items-start gap-3" aria-label={`${isReply ? 'Reply' : 'Comment'} by ${comment.userName}`}>
    <img src={comment.userAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-white truncate">@{comment.userName}</span>
        <time dateTime={comment.createdAt} className="text-xs text-slate-400 shrink-0">
          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
        </time>
      </div>
      <p className="mt-0.5 text-sm text-slate-200 leading-relaxed break-words">{comment.content}</p>

      <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
        <button
          type="button"
          onClick={() => onLike(comment.id)}
          aria-pressed={comment.userLiked}
          className={`flex items-center gap-1 py-1 hover:text-white transition-colors ${comment.userLiked ? 'text-accent-400 font-medium' : ''}`}
        >
          <Heart className={`w-3.5 h-3.5 ${comment.userLiked ? 'fill-current' : ''}`} />
          <span>{comment.likesCount}</span>
        </button>
        <button type="button" onClick={() => onReply(comment)} className="flex items-center gap-1 py-1 hover:text-white transition-colors">
          <CornerDownRight className="w-3.5 h-3.5" />
          <span>Reply</span>
        </button>
      </div>
    </div>
  </article>
);
