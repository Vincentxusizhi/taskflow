import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  Timestamp
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { getFunctions, httpsCallable } from "firebase/functions";

const Teams = () => {
  const navigate = useNavigate();
  const functions = getFunctions();
  const [teams, setTeams] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [userData, setUserData] = useState(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("team_member");
  const [teamMembers, setTeamMembers] = useState([]);
  const [emailError, setEmailError] = useState("");
  const [searchingUser, setSearchingUser] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showTeamDetailModal, setShowTeamDetailModal] = useState(false);
  const [confirmDisbandModal, setConfirmDisbandModal] = useState(false);
  const [teamDisbanding, setTeamDisbanding] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("team_member");
  const [newMemberSearchResults, setNewMemberSearchResults] = useState([]);
  const [showNewMemberSearchResults, setShowNewMemberSearchResults] =
    useState(false);
  const [addingNewMember, setAddingNewMember] = useState(false);
  const [newMemberError, setNewMemberError] = useState("");
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [memberUpdating, setMemberUpdating] = useState(false);
  const sidebarRef = useRef(null);
  const [teamPermissions, setTeamPermissions] = useState({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName:
                userSnap.data().displayName || user.displayName || "User",
              photoURL: user.photoURL || "https://via.placeholder.com/100",
              ...userSnap.data(),
            });
          } else {
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || "User",
              photoURL: user.photoURL || "https://via.placeholder.com/100",
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
      }
    });

    fetchUserTeams();
    return () => unsubscribe();
  }, []);

  const fetchUserTeams = async () => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const teamsRef = collection(db, "teams");
      const q = query(teamsRef, where("members", "array-contains", userId));
      const querySnapshot = await getDocs(q);

      const teamsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setTeams(teamsData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching teams:", error);
      setLoading(false);
    }
  };

  const searchUsers = async (searchText, forNewMember = false) => {
    if (!searchText.trim() || searchText.length < 2) {
      if (forNewMember) {
        setNewMemberSearchResults([]);
        setShowNewMemberSearchResults(false);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
      return;
    }

    try {
      const searchUsersFunction = httpsCallable(functions, 'searchUsers');
      const result = await searchUsersFunction({ searchText });
      
      const users = result.data.results || [];
      
      if (forNewMember) {
        setNewMemberSearchResults(users);
        setShowNewMemberSearchResults(users.length > 0);
      } else {
        setSearchResults(users);
        setShowSearchResults(users.length > 0);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    }
  };

  useEffect(() => {
    // Debounce search for team creation
    const timeoutId = setTimeout(() => {
      searchUsers(memberEmail);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [memberEmail]);

  useEffect(() => {
    // Debounce search for adding new members in team details
    const timeoutId = setTimeout(() => {
      searchUsers(newMemberEmail, true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [newMemberEmail]);

  const handleAddMember = async (selectedUser = null) => {
    let userToAdd;
    const currentUserId = auth.currentUser?.uid;
    const currentUserEmail = userData?.email;

    if (selectedUser) {
      // If a user was selected from search results
      userToAdd = {
        ...selectedUser,
        role: memberRole,
      };
    } else if (!memberEmail.trim()) {
      setEmailError("Please enter an email address");
      return;
    } else {
      // If manually entered an email
      // Check if user is trying to add themselves
      if (
        memberEmail.trim().toLowerCase() === currentUserEmail?.toLowerCase()
      ) {
        setEmailError("You cannot add yourself as a team member");
        return;
      }

      setSearchingUser(true);
      setEmailError("");

      try {
        // Check if user exists in the database
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", memberEmail.trim()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setEmailError("No user found with this email address");
          setSearchingUser(false);
          return;
        }

        // Get the user data
        const userDoc = querySnapshot.docs[0];

        // Check if user is trying to add themselves
        if (userDoc.id === currentUserId) {
          setEmailError("You cannot add yourself as a team member");
          setSearchingUser(false);
          return;
        }

        userToAdd = {
          uid: userDoc.id,
          email: userDoc.data().email,
          displayName: userDoc.data().displayName || "User",
          role: memberRole,
        };
      } catch (error) {
        console.error("Error checking user:", error);
        setEmailError("Error checking user");
        setSearchingUser(false);
        return;
      } finally {
        setSearchingUser(false);
      }
    }

    // Check if user is already added
    const exists = teamMembers.some(
      (member) => member.email === userToAdd.email
    );
    if (exists) {
      setEmailError("This user is already added to the team");
      return;
    }

    // Add user to the team members list
    setTeamMembers([...teamMembers, userToAdd]);
    setMemberEmail("");
    setMemberRole("team_member");
    setShowSearchResults(false);
  };

  const handleAddNewMember = async (selectedUser = null) => {
    if (!selectedTeam) return;

    let userToAdd;
    const currentUserId = auth.currentUser?.uid;
    const currentUserEmail = userData?.email;

    if (selectedUser) {
      // If a user was selected from search results
      userToAdd = {
        ...selectedUser,
        role: newMemberRole,
      };
    } else if (!newMemberEmail.trim()) {
      setNewMemberError("Please enter an email address");
      return;
    } else {
      // If manually entered an email
      // Check if user is trying to add themselves
      if (
        newMemberEmail.trim().toLowerCase() === currentUserEmail?.toLowerCase()
      ) {
        setNewMemberError("You cannot add yourself as a team member");
        return;
      }

      setAddingNewMember(true);
      setNewMemberError("");

      try {
        // user cloud function to search users
        const searchUsersFunction = httpsCallable(functions, 'searchUsers');
        const result = await searchUsersFunction({ searchText: newMemberEmail.trim() });
        
        const users = result.data.results || [];
        
        if (users.length === 0) {
          setNewMemberError("No user found with this email address");
          setAddingNewMember(false);
          return;
        }
        
        // use the first user found
        userToAdd = {
          ...users[0],
          role: newMemberRole
        };
        
        // check if trying to add yourself
        if (userToAdd.uid === currentUserId) {
          setNewMemberError("You cannot add yourself again");
          setAddingNewMember(false);
          return;
        }
      } catch (error) {
        console.error("Error searching for user:", error);
        setNewMemberError("Error searching for user");
        setAddingNewMember(false);
        return;
      }
    }

    try {
      // use cloud function to add team member
      const addTeamMemberFunction = httpsCallable(functions, 'addTeamMember');
      const result = await addTeamMemberFunction({ 
        teamId: selectedTeam.id, 
        memberData: userToAdd 
      });
      
      // use cloud function to update local state
      const updatedMembersData = result.data.updatedMembers;
      const updatedMembers = updatedMembersData.map(member => member.uid);
      
      // update selected team state
      setSelectedTeam({
        ...selectedTeam,
        members: updatedMembers,
        membersData: updatedMembersData,
      });

      // update team list
      setTeams(
        teams.map((team) =>
          team.id === selectedTeam.id
            ? {
                ...team,
                members: updatedMembers,
                membersData: updatedMembersData,
              }
            : team
        )
      );

      // reset form
      setNewMemberEmail("");
      setNewMemberRole("team_member");
      setShowNewMemberSearchResults(false);
    } catch (error) {
      console.error("Error adding new member:", error);
      let errorMessage = "Failed to add member to team";
      
      // provide more specific error information based on cloud function response
      if (error.details) {
        if (error.details.code === 'already-exists') {
          errorMessage = "This user is already a member of the team";
        } else if (error.details.code === 'permission-denied') {
          errorMessage = "You don't have permission to add members to this team";
        }
      }
      
      setNewMemberError(errorMessage);
    } finally {
      setAddingNewMember(false);
    }
  };

  const changeMemberRole = (email, newRole) => {
    setTeamMembers(
      teamMembers.map((member) =>
        member.email === email ? { ...member, role: newRole } : member
      )
    );
  };

  const updateTeamMemberRole = async (memberId, newRole) => {
    if (!selectedTeam) return;

    setMemberUpdating(true);
    try {
      // use cloud function to update member role
      const updateTeamMemberRoleFunction = httpsCallable(functions, 'updateTeamMemberRole');
      const result = await updateTeamMemberRoleFunction({ 
        teamId: selectedTeam.id, 
        memberId: memberId,
        newRole: newRole
      });
      
      // use returned data to update local state
      const updatedMembersData = result.data.updatedMembers;
      
      // update team state
      setSelectedTeam({
        ...selectedTeam,
        membersData: updatedMembersData,
      });

      // update team list
      setTeams(
        teams.map((team) =>
          team.id === selectedTeam.id
            ? { ...team, membersData: updatedMembersData }
            : team
        )
      );
    } catch (error) {
      console.error("Error updating member role:", error);
    } finally {
      setMemberUpdating(false);
    }
  };

  const selectUserFromSearch = (user) => {
    setMemberEmail(user.email);
    setShowSearchResults(false);
  };

  const selectNewMemberFromSearch = (user) => {
    setNewMemberEmail(user.email);
    setShowNewMemberSearchResults(false);
  };

  const removeMember = (email) => {
    setTeamMembers(teamMembers.filter((member) => member.email !== email));
  };

  const confirmRemoveMember = (memberId) => {
    setRemovingMemberId(memberId);
    setShowRemoveConfirmation(true);
  };

  const removeTeamMember = async () => {
    if (!selectedTeam || !removingMemberId) return;

    try {
      // use cloud function to remove team member
      const removeTeamMemberFunction = httpsCallable(functions, 'removeTeamMember');
      const result = await removeTeamMemberFunction({ 
        teamId: selectedTeam.id, 
        memberId: removingMemberId 
      });

      // update local state
      const updatedMembersData = result.data.updatedMembers;
      const updatedMembers = updatedMembersData.map(member => member.uid);
      
      setSelectedTeam({
        ...selectedTeam,
        members: updatedMembers,
        membersData: updatedMembersData,
      });

      // update team list
      setTeams(
        teams.map((team) =>
          team.id === selectedTeam.id
            ? {
                ...team,
                members: updatedMembers,
                membersData: updatedMembersData,
              }
            : team
        )
      );

      // close confirm modal
      setShowRemoveConfirmation(false);
      setRemovingMemberId(null);
    } catch (error) {
      console.error("Error removing team member:", error);
    }
  };

  const viewTeamDetails = (team) => {
    setSelectedTeam(team);
    setShowTeamDetailModal(true);
  };

  // navigate to team tasks page
  const goToTeamTasks = (teamId) => {
    navigate(`/team/${teamId}/tasks`);
  };

  const closeTeamDetails = () => {
    setShowTeamDetailModal(false);
    setSelectedTeam(null);
    setNewMemberEmail("");
    setNewMemberRole("team_member");
    setNewMemberError("");
  };

  const openDisbandConfirmation = () => {
    setConfirmDisbandModal(true);
  };

  const closeDisbandConfirmation = () => {
    setConfirmDisbandModal(false);
  };

  const closeRemoveConfirmation = () => {
    setShowRemoveConfirmation(false);
    setRemovingMemberId(null);
  };

  const disbandTeam = async () => {
    if (!selectedTeam) return;

    setTeamDisbanding(true);
    try {
      // use cloud function to disband team
      const disbandTeamFunction = httpsCallable(functions, 'disbandTeam');
      await disbandTeamFunction({ teamId: selectedTeam.id });

      // update UI
      setTeams(teams.filter((team) => team.id !== selectedTeam.id));
      setShowTeamDetailModal(false);
      setConfirmDisbandModal(false);
      setSelectedTeam(null);
    } catch (error) {
      console.error("Error disbanding team:", error);
    } finally {
      setTeamDisbanding(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      if (!newTeamName.trim()) return;
      
      // Call cloud function to create team
      const createTeamFunction = httpsCallable(functions, 'createTeam');
      await createTeamFunction({
        name: newTeamName.trim(),
        members: teamMembers
      });

      // Reset form
      setNewTeamName("");
      setTeamMembers([]);
      setShowCreateModal(false);
      fetchUserTeams();
    } catch (error) {
      console.error("Error creating team:", error);
      alert("Failed to create team. Please try again.");
    }
  };

  const handleOutsideClick = (e) => {
    if (
      sidebarRef.current &&
      !sidebarRef.current.contains(e.target) &&
      e.target.classList.contains("sidebar-overlay")
    ) {
      setShowSidebar(false);
    }
  };

  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === "Escape" && showSidebar) {
        setShowSidebar(false);
      }
    };

    if (showSidebar) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [showSidebar]);

  // Check if user is a team admin
  const isUserTeamAdmin = async (team) => {
    if (!team || !auth.currentUser) return false;
    
    try {
      const checkTeamPermissionFunction = httpsCallable(functions, 'checkIsTeamAdmin');
      const result = await checkTeamPermissionFunction({ teamId: team.id });
      return result.data.isAdmin;
    } catch (error) {
      console.error("Error checking team admin permission:", error);
      return false;
    }
  };

  // Check if user is a team manager or admin
  const isUserTeamManager = async (team) => {
    if (!team || !auth.currentUser) return false;
    
    try {
      const checkTeamPermissionFunction = httpsCallable(functions, 'checkIsTeamManager');
      const result = await checkTeamPermissionFunction({ teamId: team.id });
      return result.data.isManager;
    } catch (error) {
      console.error("Error checking team manager permission:", error);
      return false;
    }
  };

  // initialize or update permissions
  useEffect(() => {
    if (selectedTeam) {
      const checkPermissions = async () => {
        const isAdmin = await isUserTeamAdmin(selectedTeam);
        const isManager = await isUserTeamManager(selectedTeam);
        
        setTeamPermissions({
          isAdmin,
          isManager,
          teamId: selectedTeam.id
        });
      };
      
      checkPermissions();
    }
  }, [selectedTeam]);
  
  // check if user is team admin
  const checkIsAdmin = (team) => {
    if (teamPermissions.teamId === team?.id) {
      return teamPermissions.isAdmin;
    }
    // use local check as fallback
    return team?.membersData?.some(
      (member) => member.uid === auth.currentUser?.uid && member.role === "admin"
    );
  };
  
  // check if user is team manager or admin
  const checkIsManager = (team) => {
    if (teamPermissions.teamId === team?.id) {
      return teamPermissions.isManager;
    }
    // use local check as fallback
    return team?.membersData?.some(
      (member) => 
        member.uid === auth.currentUser?.uid &&
        (member.role === "admin" || member.role === "manager")
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-16 dark:bg-gray-900">
      <Header />

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Teams</h1>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              Create Team
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg shadow-md p-6 animate-pulse dark:bg-gray-800"
                >
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4 dark:bg-gray-700"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2 dark:bg-gray-700"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6 dark:bg-gray-700"></div>
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="h-8 bg-gray-200 rounded w-1/3 dark:bg-gray-700"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center dark:bg-gray-800">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-emerald-900/30">
                <i className="fas fa-users text-emerald-500 text-2xl dark:text-emerald-400"></i>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2 dark:text-white">
                No Teams Yet
              </h2>
              <p className="text-gray-600 mb-6 dark:text-gray-300">
                Create your first team to start collaborating with others.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
              >
                Create Team
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden dark:bg-gray-800"
                >
                  <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-2 dark:text-white">
                      {team.name}
                    </h2>
                    <p className="text-gray-600 mb-4 dark:text-gray-300">{team.description}</p>
                    <div className="flex items-center text-sm text-gray-500 mb-4 dark:text-gray-400">
                      <i className="fas fa-users mr-2"></i>
                      <span>{team.membersData?.length || 0} members</span>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between dark:bg-gray-700 dark:border-gray-600">
                    <button
                      onClick={() => viewTeamDetails(team)}
                      className="text-emerald-600 hover:text-emerald-700 font-medium dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      Team Details
                    </button>
                    <button
                      onClick={() => goToTeamTasks(team.id)}
                      className="text-blue-600 hover:text-blue-700 font-medium dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      View Tasks
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Create new Team</h3>
            <form onSubmit={handleCreateTeam}>
              <div className="mb-6">
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:bg-gray-700 dark:text-white"
                  placeholder="The Team Name"
                  required
                />
              </div>

              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">
                    Invite Members
                  </label>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <i className="fas fa-info-circle mr-1"></i>
                    <span>You will be the Administrator</span>
                  </div>
                </div>

                <div className="flex space-x-2 mb-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      onFocus={() => {
                        if (searchResults.length > 0) {
                          setShowSearchResults(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSearchResults(false), 200);
                      }}
                      className={`w-full px-3 py-2 border ${
                        emailError ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                      } rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:bg-gray-700 dark:text-white`}
                      placeholder="Search by name or email"
                    />
                    {emailError && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-400">{emailError}</p>
                    )}

                    {/* Search Results Dropdown */}
                    {showSearchResults && searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                        {searchResults.map((user) => (
                          <div
                            key={user.uid}
                            className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                            onClick={() => selectUserFromSearch(user)}
                          >
                            <div className="flex-shrink-0 h-10 w-10 rounded-full overflow-hidden">
                              <img
                                src={user.photoURL}
                                alt={user.displayName}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src =
                                    "https://via.placeholder.com/40?text=" +
                                    user.displayName.charAt(0);
                                }}
                              />
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.displayName}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-48">
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="manager">Manager</option>
                      <option value="team_member">Team Member</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddMember()}
                    disabled={searchingUser}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    {searchingUser ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
              </div>

              {/* Team members list */}
              {teamMembers.length > 0 && (
                <div className="mb-6">
  <h4 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
    Added Members
  </h4>
  <div className="bg-gray-50 rounded-lg overflow-hidden dark:bg-gray-700">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
      <thead className="bg-gray-100 dark:bg-gray-600">
        <tr>
          <th
            scope="col"
            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
          >
            Member
          </th>
          <th
            scope="col"
            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
          >
            Role
          </th>
          <th
            scope="col"
            className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
          >
            Action
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-600">
        {teamMembers.map((member, index) => (
          <tr key={index}>
            <td className="px-4 py-3 whitespace-nowrap">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-8 w-8 bg-emerald-100 rounded-full flex items-center justify-center dark:bg-emerald-900">
                  <span className="text-emerald-800 font-medium dark:text-emerald-200">
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {member.displayName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {member.email}
                  </div>
                </div>
              </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <select
                value={member.role}
                onChange={(e) =>
                  changeMemberRole(member.email, e.target.value)
                }
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="manager">Manager</option>
                <option value="team_member">Team Member</option>
              </select>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
              <button
                type="button"
                onClick={() => removeMember(member.email)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                aria-label="Remove member"
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
              )}

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewTeamName("");
                    setTeamMembers([]);
                    setEmailError("");
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTeamDetailModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold dark:text-gray-100">
                  {selectedTeam.name}
                </h3>
              </div>
              <button
                onClick={closeTeamDetails}
                className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                aria-label="Close"
              >
                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Team Info */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-2 dark:text-gray-200">
                Team Information
              </h4>
              <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Created by
                  </p>
                  <p className="text-gray-800 dark:text-gray-200">
                    {selectedTeam.membersData?.find(
                      (m) => m.uid === selectedTeam.createdBy
                    )?.displayName || "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Created at
                  </p>
                  <p className="text-gray-800 dark:text-gray-200">
                    {selectedTeam.createdAt
                      ? new Date(
                          selectedTeam.createdAt.seconds * 1000
                        ).toLocaleString()
                      : "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            {/* Team Members */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-lg font-semibold dark:text-gray-200">
                  Team Members
                </h4>

                {/* Add new member button (for admins and managers) */}
                {checkIsManager(selectedTeam) && (
                  <div
                    className="text-sm text-emerald-500 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 flex items-center"
                    //   onClick={() => setShowNewMemberForm(prevState => !prevState)}
                  >
                    <i className="fas fa-plus-circle mr-1"></i>
                    Add Member
                  </div>
                )}
              </div>

              {/* Add new member form */}
              {checkIsManager(selectedTeam) && (
                <div className="mb-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <div className="flex space-x-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        onFocus={() => {
                          if (newMemberSearchResults.length > 0) {
                            setShowNewMemberSearchResults(true);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(
                            () => setShowNewMemberSearchResults(false),
                            200
                          );
                        }}
                        className={`w-full px-3 py-2 border ${
                          newMemberError
                            ? "border-red-500"
                            : "border-gray-300 dark:border-gray-600"
                        } rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-600 dark:text-gray-200`}
                        placeholder="Search by name or email"
                      />
                      {newMemberError && (
                        <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                          {newMemberError}
                        </p>
                      )}

                      {/* Search Results Dropdown for new members */}
                      {showNewMemberSearchResults &&
                        newMemberSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                            {newMemberSearchResults.map((user) => (
                              <div
                                key={user.uid}
                                className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                                onClick={() => selectNewMemberFromSearch(user)}
                              >
                                <div className="flex-shrink-0 h-10 w-10 rounded-full overflow-hidden">
                                  <img
                                    src={user.photoURL}
                                    alt={user.displayName}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      e.target.onerror = null;
                                      e.target.src =
                                        "https://via.placeholder.com/40?text=" +
                                        user.displayName.charAt(0);
                                    }}
                                  />
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                    {user.displayName}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {user.email}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                    <div className="w-48">
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-600 dark:text-gray-200"
                      >
                        <option value="manager">Manager</option>
                        <option value="team_member">Team Member</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddNewMember()}
                      disabled={addingNewMember}
                      className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors"
                    >
                      {addingNewMember ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-100 dark:bg-gray-600">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        Member
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        Role
                      </th>
                      {checkIsAdmin(selectedTeam) && (
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                    {selectedTeam.membersData?.map((member, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center">
                              <span className="text-emerald-800 dark:text-emerald-200 font-medium">
                                {member.displayName?.charAt(0).toUpperCase() ||
                                  "U"}
                              </span>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                {member.displayName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {checkIsAdmin(selectedTeam) &&
                          member.uid !== auth.currentUser?.uid ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                updateTeamMemberRole(member.uid, e.target.value)
                              }
                              disabled={memberUpdating}
                              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="manager">Manager</option>
                              <option value="team_member">Team Member</option>
                            </select>
                          ) : (
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                member.role === "admin"
                                  ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                                  : member.role === "manager"
                                  ? "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200"
                                  : "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                              }`}
                            >
                              {member.role === "admin"
                                ? "Admin"
                                : member.role === "manager"
                                ? "Manager"
                                : "Team Member"}
                            </span>
                          )}
                        </td>
                        {checkIsAdmin(selectedTeam) && (
                          <td className="px-4 py-3 whitespace-nowrap ">
                            {member.uid !== auth.currentUser?.uid &&
                              member.role !== "admin" && (
                                <button
                                  onClick={() =>
                                    confirmRemoveMember(member.uid)
                                  }
                                  className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                  title="Delete member"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            

            {/* Team Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              <div className="flex justify-between items-center">
                <div>
                  <button
                    onClick={() => goToTeamTasks(selectedTeam.id)}
                    className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors flex items-center"
                  >
                    <i className="fas fa-tasks mr-2"></i>
                    View Tasks
                  </button>
                </div>

                {/* Admin Actions */}
                {checkIsAdmin(selectedTeam) && (
                  <div>
                    <button
                      onClick={openDisbandConfirmation}
                      className="px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700"
                    >
                      Disband Team
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDisbandModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 dark:text-gray-200">
              Confirm Team Dissolution
            </h3>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              Are you sure you want to disband the team "{selectedTeam.name}"?
              This action cannot be undone and all team data will be permanently
              deleted.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={closeDisbandConfirmation}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                disabled={teamDisbanding}
              >
                Cancel
              </button>
              <button
                onClick={disbandTeam}
                className="px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700 flex items-center"
                disabled={teamDisbanding}
              >
                {teamDisbanding ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Disbanding...
                  </>
                ) : (
                  "Disband Team"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoveConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 dark:text-gray-200">
              Remove Team Member
            </h3>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              Are you sure you want to remove this member from the team? They
              will lose all access to team resources and tasks.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={closeRemoveConfirmation}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={removeTeamMember}
                className="px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-700"
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teams;
