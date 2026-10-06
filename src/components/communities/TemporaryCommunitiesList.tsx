import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { TemporaryCommunity } from '../../types/pulse';
import {
  Users,
  Clock,
  Send,
  X,
  MessageSquare,
  Sparkles,
  Radio,
  Flame
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TemporaryCommunitiesListProps {
  selectedCommunityId?: string | null;
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  time: string;
  avatar: string;
}

export const TemporaryCommunitiesList: React.FC<TemporaryCommunitiesListProps> = ({
  selectedCommunityId,
  onClose
}) => {
  const { temporaryCommunities, userProfile } = usePulse();

  const [activeCommunityId, setActiveCommunityId] = useState<string>(
    selectedCommunityId || temporaryCommunities[0]?.id || ''
  );

  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({
    'comm-1': [
      {
        id: 'm-1',
        user: 'Tunde_Lagos',
        text: 'The live reggae band is tuning up right now near the fountain stage!',
        time: '5m ago',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
      },
      {
        id: 'm-2',
        user: 'Ngozi_K',
        text: 'Does anyone know if the art exhibition pavilion requires a separate pass?',
        time: '2m ago',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
      },
      {
        id: 'm-3',
        user: 'Chinedu_X',
        text: 'No extra pass needed! Just walked in, incredible wood sculptures.',
        time: 'Just now',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80'
      }
    ],
    'comm-2': [
      {
        id: 'm-4',
        user: 'Femi_Code',
        text: 'Demo pitches start in 10 minutes at the lecture hall! Judges from YC just walked in.',
        time: '4m ago',
        avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80'
      }
    ],
    'comm-3': [
      {
        id: 'm-5',
        user: 'Driver_VI',
        text: 'Traffic officers are now diverting traffic via Bishop Oluwole.',
        time: '8m ago',
        avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80'
      }
    ]
  });

  const [inputVal, setInputVal] = useState('');

  const activeGroup =
    temporaryCommunities.find((c) => c.id === activeCommunityId) ||
    temporaryCommunities[0];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !activeGroup) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      user: userProfile.username,
      text: inputVal.trim(),
      time: 'Just now',
      avatar: userProfile.avatar
    };

    setMessages((prev) => ({
      ...prev,
      [activeGroup.id]: [...(prev[activeGroup.id] || []), newMsg]
    }));

    setInputVal('');
  };

  if (!activeGroup) return null;

  const currentChatMessages = messages[activeGroup.id] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl h-[85vh] flex flex-col rounded-3xl glass-panel border border-white/10 shadow-2xl text-white overflow-hidden">
        {/* Top Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{activeGroup.name}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Live Hub
                </span>
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-cyan-400" /> {activeGroup.memberCount} members
                </span>
                <span>•</span>
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Auto-expires when activity ends
                </span>
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Temporary Groups Selector Tabs */}
        <div className="px-3 py-2 bg-slate-950/60 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {temporaryCommunities.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCommunityId(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                c.id === activeGroup.id
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>{c.name}</span>
            </button>
          ))}
        </div>

        {/* Ephemeral Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
            <span>
              This is a temporary pop-up channel formed around <strong>{activeGroup.name}</strong>.
              All messages disappear once the moment expires.
            </span>
          </div>

          {currentChatMessages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-900/60 border border-white/5"
            >
              <img
                src={msg.avatar}
                alt={msg.user}
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-slate-200">@{msg.user}</span>
                  <span className="text-[10px] text-slate-500">{msg.time}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed break-words">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-white/10 glass-panel shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={`Message everyone at ${activeGroup.name}...`}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
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
