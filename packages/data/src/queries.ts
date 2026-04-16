import type {
  DirectoryProfile,
  SaveCreatorProfileInput,
  SaveSupporterProfileInput,
  ViewerProfile
} from '@syncrolly/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapConversationDetail, mapInboxThreadSummary, mapViewerProfile } from './mappers';
import type { Database, PublicRow } from './database.types';

type SyncrollySupabaseClient = SupabaseClient<Database>;
type ProfileRow = PublicRow<'profiles'>;
type MessageRow = PublicRow<'messages'>;

function requireData<T>(data: T | null, message: string): T {
  if (data == null) {
    throw new Error(message);
  }

  return data;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sortMessagesAscending(messages: MessageRow[]): MessageRow[] {
  return [...messages].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return '';
}

function isMissingDirectConversationRpc(error: unknown): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error);

  return (
    errorCode === 'PGRST202' ||
    errorCode === '42883' ||
    errorText.includes('get_or_create_direct_conversation')
  );
}

function isConversationInsertRlsError(error: unknown): boolean {
  const errorCode = getErrorCode(error);
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorCode === '42501' &&
    errorText.includes('row-level security') &&
    errorText.includes('conversations')
  );
}

function getDirectConversationMigrationMessage(): string {
  return 'Run supabase/migrations/20260416_direct_conversation_rpc.sql in the Supabase SQL editor, then try New Message again.';
}

async function notifyMessageRecipients(
  client: SyncrollySupabaseClient,
  input: {
    messageId: string;
  }
) {
  try {
    const { error } = await client.functions.invoke('notify-new-message', {
      body: {
        messageId: input.messageId
      }
    });

    if (error) {
      console.warn('Push notification dispatch failed', error);
    }
  } catch (error) {
    console.warn('Push notification dispatch failed', error);
  }
}

export async function getViewerProfile(
  client: SyncrollySupabaseClient,
  userId: string
): Promise<ViewerProfile | null> {
  const [
    { data: profile, error: profileError },
    { data: creatorProfile, error: creatorError },
    { data: supporterProfile, error: supporterError }
  ] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('creator_profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('supporter_profiles').select('*').eq('user_id', userId).maybeSingle()
  ]);

  if (profileError) throw profileError;
  if (creatorError) throw creatorError;
  if (supporterError) throw supporterError;
  if (!profile) return null;

  return mapViewerProfile({
    profile,
    creatorProfile,
    supporterProfile
  });
}

export async function saveCreatorProfile(
  client: SyncrollySupabaseClient,
  input: SaveCreatorProfileInput
): Promise<ViewerProfile> {
  const [{ error: profileError }, { error: creatorError }] = await Promise.all([
    client
      .from('profiles')
      .update({
        role: 'creator',
        display_name: input.displayName,
        avatar_url: input.avatarUrl ?? null,
        accent_color: input.accentColor ?? '#003f87',
        presence: input.presence ?? 'offline'
      })
      .eq('id', input.userId),
    client.from('creator_profiles').upsert({
      user_id: input.userId,
      niche: input.niche,
      headline: input.headline,
      dm_access: input.dmAccess
    })
  ]);

  if (profileError) throw profileError;
  if (creatorError) throw creatorError;

  return requireData(await getViewerProfile(client, input.userId), 'Creator profile could not be reloaded.');
}

export async function saveSupporterProfile(
  client: SyncrollySupabaseClient,
  input: SaveSupporterProfileInput
): Promise<ViewerProfile> {
  const [{ error: profileError }, { error: supporterError }] = await Promise.all([
    client
      .from('profiles')
      .update({
        role: 'supporter',
        display_name: input.displayName,
        avatar_url: input.avatarUrl ?? null,
        accent_color: input.accentColor ?? '#115cb9',
        presence: input.presence ?? 'offline'
      })
      .eq('id', input.userId),
    client.from('supporter_profiles').upsert({
      user_id: input.userId,
      access_level: input.accessLevel,
      total_spend: input.totalSpend
    })
  ]);

  if (profileError) throw profileError;
  if (supporterError) throw supporterError;

  return requireData(await getViewerProfile(client, input.userId), 'Supporter profile could not be reloaded.');
}

export async function listInboxThreads(client: SyncrollySupabaseClient, viewerId: string) {
  const { data: memberships, error: membershipsError } = await client
    .from('conversation_participants')
    .select('*')
    .eq('user_id', viewerId);

  if (membershipsError) throw membershipsError;
  if (!memberships?.length) return [];

  const conversationIds = memberships.map((membership) => membership.conversation_id);

  const [
    { data: conversations, error: conversationsError },
    { data: participantRows, error: participantsError },
    { data: messages, error: messagesError }
  ] = await Promise.all([
    client.from('conversations').select('*').in('id', conversationIds),
    client.from('conversation_participants').select('*').in('conversation_id', conversationIds),
    client.from('messages').select('*').in('conversation_id', conversationIds).order('created_at', { ascending: false })
  ]);

  if (conversationsError) throw conversationsError;
  if (participantsError) throw participantsError;
  if (messagesError) throw messagesError;

  const counterpartIds = unique(
    (participantRows ?? [])
      .filter((row) => row.user_id !== viewerId)
      .map((row) => row.user_id)
  );

  const [{ data: profiles, error: profilesError }, { data: supporterProfiles, error: supporterProfilesError }] = await Promise.all([
    counterpartIds.length
      ? client.from('profiles').select('*').in('id', counterpartIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    counterpartIds.length
      ? client.from('supporter_profiles').select('*').in('user_id', counterpartIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (profilesError) throw profilesError;
  if (supporterProfilesError) throw supporterProfilesError;

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const supporterProfilesById = new Map((supporterProfiles ?? []).map((profile) => [profile.user_id, profile]));
  const membershipsByConversationId = new Map(memberships.map((membership) => [membership.conversation_id, membership]));
  const latestMessageByConversationId = new Map<string, MessageRow>();

  for (const message of messages ?? []) {
    if (!latestMessageByConversationId.has(message.conversation_id)) {
      latestMessageByConversationId.set(message.conversation_id, message);
    }
  }

  return (conversations ?? [])
    .map((conversation) => {
      const counterpartMembership = participantRows?.find(
        (row) => row.conversation_id === conversation.id && row.user_id !== viewerId
      );
      const counterpart = counterpartMembership ? profilesById.get(counterpartMembership.user_id) : undefined;

      if (!counterpart) {
        return null;
      }

      return mapInboxThreadSummary({
        conversation,
        counterpart,
        counterpartSupporterProfile: supporterProfilesById.get(counterpart.id),
        lastMessage: latestMessageByConversationId.get(conversation.id),
        membership: membershipsByConversationId.get(conversation.id)
      });
    })
    .filter((thread): thread is NonNullable<typeof thread> => thread !== null)
    .sort((left, right) => {
      const leftTime = latestMessageByConversationId.get(left.id)?.created_at ?? '';
      const rightTime = latestMessageByConversationId.get(right.id)?.created_at ?? '';
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
}

export async function getConversationDetails(
  client: SyncrollySupabaseClient,
  conversationId: string,
  viewerId: string
) {
  const [
    { data: conversation, error: conversationError },
    { data: participantRows, error: participantsError },
    { data: messages, error: messagesError }
  ] = await Promise.all([
    client.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
    client.from('conversation_participants').select('*').eq('conversation_id', conversationId),
    client.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  ]);

  if (conversationError) throw conversationError;
  if (participantsError) throw participantsError;
  if (messagesError) throw messagesError;
  if (!conversation) return null;

  const counterpartMembership = participantRows?.find((row) => row.user_id !== viewerId);

  if (!counterpartMembership) {
    return null;
  }

  const { data: counterpart, error: counterpartError } = await client
    .from('profiles')
    .select('*')
    .eq('id', counterpartMembership.user_id)
    .maybeSingle();

  if (counterpartError) throw counterpartError;
  if (!counterpart) return null;

  return mapConversationDetail({
    conversation,
    counterpart,
    messages: sortMessagesAscending(messages ?? []),
    viewerId
  });
}

export async function sendMessage(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
    senderId: string;
    body: string;
  }
) {
  const trimmedBody = input.body.trim();

  if (!trimmedBody) {
    throw new Error('Message body cannot be empty.');
  }

  const { data: insertedMessage, error: insertError } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: trimmedBody
    })
    .select('*')
    .single();

  if (insertError) throw insertError;

  const { error: updateReadError } = await client
    .from('conversation_participants')
    .update({
      last_read_at: insertedMessage.created_at
    })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.senderId);

  if (updateReadError) throw updateReadError;

  await notifyMessageRecipients(client, {
    messageId: insertedMessage.id
  });

  return insertedMessage;
}

export async function createDirectConversation(
  client: SyncrollySupabaseClient,
  input: {
    createdBy: string;
    counterpartUserId: string;
    subject?: string;
    status?: Database['public']['Tables']['conversations']['Row']['status'];
  }
) {
  const { data: conversationId, error: rpcError } = await client.rpc('get_or_create_direct_conversation', {
    target_user_id: input.counterpartUserId,
    conversation_subject: input.subject ?? ''
  });

  if (rpcError) {
    if (isMissingDirectConversationRpc(rpcError)) {
      return createDirectConversationFallback(client, input);
    }

    throw rpcError;
  }

  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (conversationError) throw conversationError;

  return conversation;
}

async function createDirectConversationFallback(
  client: SyncrollySupabaseClient,
  input: {
    createdBy: string;
    counterpartUserId: string;
    subject?: string;
    status?: Database['public']['Tables']['conversations']['Row']['status'];
  }
) {
  const { data: viewerMemberships, error: viewerMembershipsError } = await client
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', input.createdBy);

  if (viewerMembershipsError) {
    throw viewerMembershipsError;
  }

  const candidateConversationIds = viewerMemberships?.map((membership) => membership.conversation_id) ?? [];

  if (candidateConversationIds.length) {
    const { data: counterpartMemberships, error: counterpartMembershipsError } = await client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', input.counterpartUserId)
      .in('conversation_id', candidateConversationIds);

    if (counterpartMembershipsError) {
      throw counterpartMembershipsError;
    }

    const sharedConversationIds = counterpartMemberships?.map((membership) => membership.conversation_id) ?? [];

    if (sharedConversationIds.length) {
      const { data: sharedParticipants, error: sharedParticipantsError } = await client
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', sharedConversationIds);

      if (sharedParticipantsError) {
        throw sharedParticipantsError;
      }

      const firstDirectConversationId = sharedConversationIds.find((conversationId) => {
        const participants = sharedParticipants?.filter((row) => row.conversation_id === conversationId) ?? [];
        return participants.length === 2;
      });

      if (firstDirectConversationId) {
        const { data: existingConversation, error: existingConversationError } = await client
          .from('conversations')
          .select('*')
          .eq('id', firstDirectConversationId)
          .single();

        if (existingConversationError) {
          throw existingConversationError;
        }

        return existingConversation;
      }
    }
  }

  const { data: newConversation, error: newConversationError } = await client
    .from('conversations')
    .insert({
      created_by: input.createdBy,
      subject: input.subject ?? '',
      status: input.status ?? 'active'
    })
    .select('*')
    .single();

  if (newConversationError) {
    if (isConversationInsertRlsError(newConversationError)) {
      throw new Error(getDirectConversationMigrationMessage());
    }

    throw newConversationError;
  }

  const { error: participantInsertError } = await client.from('conversation_participants').insert([
    {
      conversation_id: newConversation.id,
      user_id: input.createdBy
    },
    {
      conversation_id: newConversation.id,
      user_id: input.counterpartUserId
    }
  ]);

  if (participantInsertError) {
    throw participantInsertError;
  }

  return newConversation;
}

export async function markConversationRead(
  client: SyncrollySupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    readAt?: string;
  }
) {
  const { error } = await client
    .from('conversation_participants')
    .update({
      last_read_at: input.readAt ?? new Date().toISOString()
    })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId);

  if (error) throw error;
}

export async function searchProfiles(
  client: SyncrollySupabaseClient,
  searchTerm: string
): Promise<DirectoryProfile[]> {
  const { data, error } = await client.rpc('search_profiles', {
    search_term: searchTerm.trim()
  });

  if (error) throw error;

  return (data ?? []).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined,
    accentColor: profile.accent_color,
    presence: profile.presence,
    role: profile.role
  }));
}

export async function registerPushDevice(
  client: SyncrollySupabaseClient,
  input: {
    expoPushToken: string;
    platform: 'ios' | 'android' | 'web' | 'unknown';
    deviceName?: string;
    deviceModel?: string;
  }
) {
  const { data, error } = await client.rpc('register_push_device', {
    expo_push_token: input.expoPushToken,
    device_platform: input.platform,
    device_name: input.deviceName ?? undefined,
    device_model: input.deviceModel ?? undefined
  });

  if (error) throw error;

  return data;
}

export async function unregisterPushDevice(
  client: SyncrollySupabaseClient,
  input: {
    expoPushToken: string;
  }
) {
  const { error } = await client.rpc('unregister_push_device', {
    expo_push_token: input.expoPushToken
  });

  if (error) throw error;
}
