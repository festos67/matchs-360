-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'club_admin', 'coach', 'player', 'supporter');

-- Create enum for coach type
CREATE TYPE public.coach_type AS ENUM ('referent', 'assistant');

-- Create clubs table
CREATE TABLE public.clubs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    primary_color TEXT NOT NULL DEFAULT '#3B82F6',
    secondary_color TEXT DEFAULT '#0A1628',
    logo_url TEXT,
    referent_name TEXT,
    referent_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    nickname TEXT,
    photo_url TEXT,
    club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (allows multiple roles per user)
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, role, club_id)
);

-- Create teams table
CREATE TABLE public.teams (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    season TEXT DEFAULT '2024-2025',
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table (coaches and players)
CREATE TABLE public.team_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    member_type TEXT NOT NULL CHECK (member_type IN ('coach', 'player')),
    coach_role coach_type,
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    left_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(team_id, user_id)
);

-- Create supporters_link table
CREATE TABLE public.supporters_link (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    supporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(supporter_id, player_id)
);

-- Create competence_frameworks table
CREATE TABLE public.competence_frameworks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_template BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create themes table
CREATE TABLE public.themes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    framework_id UUID NOT NULL REFERENCES public.competence_frameworks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create skills table
CREATE TABLE public.skills (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    definition TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create evaluations table
CREATE TABLE public.evaluations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    framework_id UUID NOT NULL REFERENCES public.competence_frameworks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create evaluation_scores table
CREATE TABLE public.evaluation_scores (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    is_not_observed BOOLEAN NOT NULL DEFAULT false,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(evaluation_id, skill_id)
);

-- Create evaluation_objectives table
CREATE TABLE public.evaluation_objectives (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    evaluation_id UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    deadline DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporters_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competence_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_objectives ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id AND role = 'admin'
    )
$$;

-- Create function to check if user is club admin for a specific club
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id UUID, _club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id 
        AND role = 'club_admin' 
        AND club_id = _club_id
    )
$$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_clubs_updated_at
    BEFORE UPDATE ON public.clubs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competence_frameworks_updated_at
    BEFORE UPDATE ON public.competence_frameworks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'first_name',
        NEW.raw_user_meta_data ->> 'last_name'
    );
    RETURN NEW;
END;
$$;

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for clubs
CREATE POLICY "Admins can do everything with clubs"
ON public.clubs FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their club"
ON public.clubs FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT club_id FROM public.user_roles WHERE user_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
);

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Club admins can manage roles in their club"
ON public.user_roles FOR ALL
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

-- RLS Policies for teams
CREATE POLICY "Admins can do everything with teams"
ON public.teams FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Club admins can manage their teams"
ON public.teams FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Team members can view their teams"
ON public.teams FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
);

-- RLS Policies for team_members
CREATE POLICY "Admins can manage all team members"
ON public.team_members FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Club admins can manage team members in their club"
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

CREATE POLICY "Team members can view their team members"
ON public.team_members FOR SELECT
TO authenticated
USING (
    team_id IN (
        SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
);

-- RLS Policies for supporters_link
CREATE POLICY "Supporters can view their links"
ON public.supporters_link FOR SELECT
TO authenticated
USING (supporter_id = auth.uid());

CREATE POLICY "Admins can manage supporter links"
ON public.supporters_link FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for competence_frameworks
CREATE POLICY "Authenticated users can view frameworks"
ON public.competence_frameworks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage all frameworks"
ON public.competence_frameworks FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Club admins can manage their frameworks"
ON public.competence_frameworks FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- RLS Policies for themes
CREATE POLICY "Authenticated users can view themes"
ON public.themes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage all themes"
ON public.themes FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for skills
CREATE POLICY "Authenticated users can view skills"
ON public.skills FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage all skills"
ON public.skills FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for evaluations
CREATE POLICY "Coaches can create evaluations"
ON public.evaluations FOR INSERT
TO authenticated
WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can view their evaluations"
ON public.evaluations FOR SELECT
TO authenticated
USING (
    coach_id = auth.uid()
    OR player_id = auth.uid()
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Coaches can update their evaluations"
ON public.evaluations FOR UPDATE
TO authenticated
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());

-- RLS Policies for evaluation_scores
CREATE POLICY "Users can view evaluation scores"
ON public.evaluation_scores FOR SELECT
TO authenticated
USING (
    evaluation_id IN (
        SELECT id FROM public.evaluations 
        WHERE coach_id = auth.uid() OR player_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Coaches can manage evaluation scores"
ON public.evaluation_scores FOR ALL
TO authenticated
USING (
    evaluation_id IN (
        SELECT id FROM public.evaluations WHERE coach_id = auth.uid()
    )
)
WITH CHECK (
    evaluation_id IN (
        SELECT id FROM public.evaluations WHERE coach_id = auth.uid()
    )
);

-- RLS Policies for evaluation_objectives
CREATE POLICY "Users can view evaluation objectives"
ON public.evaluation_objectives FOR SELECT
TO authenticated
USING (
    evaluation_id IN (
        SELECT id FROM public.evaluations 
        WHERE coach_id = auth.uid() OR player_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Coaches can manage evaluation objectives"
ON public.evaluation_objectives FOR ALL
TO authenticated
USING (
    evaluation_id IN (
        SELECT id FROM public.evaluations WHERE coach_id = auth.uid()
    )
)
WITH CHECK (
    evaluation_id IN (
        SELECT id FROM public.evaluations WHERE coach_id = auth.uid()
    )
);