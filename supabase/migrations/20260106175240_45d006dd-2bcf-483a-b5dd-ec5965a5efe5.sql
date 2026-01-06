-- Drop existing policies to recreate with proper hierarchy
DROP POLICY IF EXISTS "Admins can do everything with clubs" ON public.clubs;
DROP POLICY IF EXISTS "Users can view their club" ON public.clubs;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Club admins can manage roles in their club" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can do everything with teams" ON public.teams;
DROP POLICY IF EXISTS "Club admins can manage their teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Admins can manage all team members" ON public.team_members;
DROP POLICY IF EXISTS "Club admins can manage team members in their club" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view their team members" ON public.team_members;

-- Helper function: Check if user is coach of a team
CREATE OR REPLACE FUNCTION public.is_coach_of_team(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE user_id = _user_id 
        AND team_id = _team_id
        AND member_type = 'coach'
        AND is_active = true
    )
$$;

-- Helper function: Check if user is referent coach of a team
CREATE OR REPLACE FUNCTION public.is_referent_coach_of_team(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE user_id = _user_id 
        AND team_id = _team_id
        AND member_type = 'coach'
        AND coach_role = 'referent'
        AND is_active = true
    )
$$;

-- Helper function: Check if user is player in a team
CREATE OR REPLACE FUNCTION public.is_player_in_team(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE user_id = _user_id 
        AND team_id = _team_id
        AND member_type = 'player'
        AND is_active = true
    )
$$;

-- Helper function: Get user's club IDs
CREATE OR REPLACE FUNCTION public.get_user_club_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT club_id 
    FROM public.user_roles 
    WHERE user_id = _user_id AND club_id IS NOT NULL
$$;

-- Helper function: Check if supporter follows a player
CREATE OR REPLACE FUNCTION public.is_supporter_of_player(_supporter_id UUID, _player_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.supporters_link
        WHERE supporter_id = _supporter_id AND player_id = _player_id
    )
$$;

-- ========== CLUBS POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to clubs"
ON public.clubs FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club Admin: View only their club
CREATE POLICY "Club admin view their club"
ON public.clubs FOR SELECT
TO authenticated
USING (
    id IN (SELECT public.get_user_club_ids(auth.uid()))
);

-- Club Admin: Update their club
CREATE POLICY "Club admin update their club"
ON public.clubs FOR UPDATE
TO authenticated
USING (public.is_club_admin(auth.uid(), id))
WITH CHECK (public.is_club_admin(auth.uid(), id));

-- ========== PROFILES POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Users can view profiles in their club or team
CREATE POLICY "Users view profiles in scope"
ON public.profiles FOR SELECT
TO authenticated
USING (
    -- Own profile
    id = auth.uid()
    -- Or profiles in same club
    OR club_id IN (SELECT public.get_user_club_ids(auth.uid()))
    -- Or team members of same team
    OR id IN (
        SELECT tm2.user_id FROM public.team_members tm1
        JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = auth.uid() AND tm1.is_active = true AND tm2.is_active = true
    )
    -- Or supporter following this player
    OR public.is_supporter_of_player(auth.uid(), id)
);

-- Users can update their own profile
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Club admins can update profiles in their club
CREATE POLICY "Club admin update profiles in club"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    club_id IN (
        SELECT ur.club_id FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
    )
)
WITH CHECK (
    club_id IN (
        SELECT ur.club_id FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
    )
);

-- ========== USER_ROLES POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to user_roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Users view their own roles
CREATE POLICY "Users view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Club admins manage roles in their club (except admin role)
CREATE POLICY "Club admin manage roles in club"
ON public.user_roles FOR ALL
TO authenticated
USING (
    role != 'admin' AND
    club_id IN (
        SELECT ur.club_id FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
    )
)
WITH CHECK (
    role != 'admin' AND
    club_id IN (
        SELECT ur.club_id FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
    )
);

-- ========== TEAMS POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to teams"
ON public.teams FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club Admin: Full access to their club's teams
CREATE POLICY "Club admin manage teams"
ON public.teams FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- Coaches: View their teams
CREATE POLICY "Coaches view their teams"
ON public.teams FOR SELECT
TO authenticated
USING (public.is_coach_of_team(auth.uid(), id));

-- Referent Coach: Update team (for framework)
CREATE POLICY "Referent coach update team"
ON public.teams FOR UPDATE
TO authenticated
USING (public.is_referent_coach_of_team(auth.uid(), id))
WITH CHECK (public.is_referent_coach_of_team(auth.uid(), id));

-- Players: View their team
CREATE POLICY "Players view their team"
ON public.teams FOR SELECT
TO authenticated
USING (public.is_player_in_team(auth.uid(), id));

-- ========== TEAM_MEMBERS POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to team_members"
ON public.team_members FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club Admin: Full access in their club
CREATE POLICY "Club admin manage team_members"
ON public.team_members FOR ALL
TO authenticated
USING (
    team_id IN (
        SELECT t.id FROM public.teams t
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
)
WITH CHECK (
    team_id IN (
        SELECT t.id FROM public.teams t
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
);

-- Coaches: View and manage players in their teams
CREATE POLICY "Coaches view team_members"
ON public.team_members FOR SELECT
TO authenticated
USING (public.is_coach_of_team(auth.uid(), team_id));

CREATE POLICY "Coaches manage players in their teams"
ON public.team_members FOR ALL
TO authenticated
USING (
    public.is_coach_of_team(auth.uid(), team_id)
    AND member_type = 'player'
)
WITH CHECK (
    public.is_coach_of_team(auth.uid(), team_id)
    AND member_type = 'player'
);

-- Players: View their teammates
CREATE POLICY "Players view teammates"
ON public.team_members FOR SELECT
TO authenticated
USING (public.is_player_in_team(auth.uid(), team_id));

-- ========== SUPPORTERS_LINK POLICIES ==========
-- Admin: Full access
CREATE POLICY "Admin full access to supporters_link"
ON public.supporters_link FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club admin can manage supporter links for players in their club
CREATE POLICY "Club admin manage supporters"
ON public.supporters_link FOR ALL
TO authenticated
USING (
    player_id IN (
        SELECT p.id FROM public.profiles p
        WHERE p.club_id IN (
            SELECT ur.club_id FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
        )
    )
)
WITH CHECK (
    player_id IN (
        SELECT p.id FROM public.profiles p
        WHERE p.club_id IN (
            SELECT ur.club_id FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
        )
    )
);

-- Coaches can manage supporter links for their players
CREATE POLICY "Coaches manage supporters for their players"
ON public.supporters_link FOR ALL
TO authenticated
USING (
    player_id IN (
        SELECT tm.user_id FROM public.team_members tm
        WHERE public.is_coach_of_team(auth.uid(), tm.team_id)
        AND tm.member_type = 'player'
    )
)
WITH CHECK (
    player_id IN (
        SELECT tm.user_id FROM public.team_members tm
        WHERE public.is_coach_of_team(auth.uid(), tm.team_id)
        AND tm.member_type = 'player'
    )
);

-- Supporters view their links
CREATE POLICY "Supporters view their links"
ON public.supporters_link FOR SELECT
TO authenticated
USING (supporter_id = auth.uid());

-- ========== COMPETENCE_FRAMEWORKS POLICIES ==========
DROP POLICY IF EXISTS "Authenticated users can view frameworks" ON public.competence_frameworks;
DROP POLICY IF EXISTS "Admins can manage all frameworks" ON public.competence_frameworks;
DROP POLICY IF EXISTS "Club admins can manage their frameworks" ON public.competence_frameworks;

-- Admin: Full access
CREATE POLICY "Admin full access to frameworks"
ON public.competence_frameworks FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club admin: Full access to their club's frameworks
CREATE POLICY "Club admin manage frameworks"
ON public.competence_frameworks FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- Referent coach: Manage team's framework
CREATE POLICY "Referent coach manage team framework"
ON public.competence_frameworks FOR ALL
TO authenticated
USING (public.is_referent_coach_of_team(auth.uid(), team_id))
WITH CHECK (public.is_referent_coach_of_team(auth.uid(), team_id));

-- View access for team members
CREATE POLICY "Team members view framework"
ON public.competence_frameworks FOR SELECT
TO authenticated
USING (
    team_id IN (
        SELECT team_id FROM public.team_members 
        WHERE user_id = auth.uid() AND is_active = true
    )
);

-- Create invitations table for tracking
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    intended_role app_role NOT NULL,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    coach_role coach_type,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    accepted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admin: Full access to invitations
CREATE POLICY "Admin full access to invitations"
ON public.invitations FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Club admin: Manage invitations for their club
CREATE POLICY "Club admin manage invitations"
ON public.invitations FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- Coaches: Create player/supporter invitations
CREATE POLICY "Coaches create invitations"
ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (
    intended_role IN ('player', 'supporter') AND
    team_id IN (
        SELECT tm.team_id FROM public.team_members tm
        WHERE tm.user_id = auth.uid() AND tm.member_type = 'coach' AND tm.is_active = true
    )
);

-- Users view invitations they sent
CREATE POLICY "Users view sent invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (invited_by = auth.uid());